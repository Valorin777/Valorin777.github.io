import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FirebaseKit } from "@/lib/firebase";
import { dayHasProgress, migrate } from "@/lib/progress";
import { isEmptyProgress } from "@/lib/sync";
import type { AppState } from "@/types/state";

/**
 * Integration test of lib/cloud.ts across devices. Every device is its own module graph
 * (lib/store + lib/cloud) with its own window, document, navigator and localStorage; all of
 * them share one in-memory Firestore and Auth (lib/firebase is mocked).
 *
 * The browser globals are proxies that resolve to the device whose code is running, tracked
 * with AsyncLocalStorage: device code runs inside device.run(), and every timer, network
 * delivery and promise continuation started there stays with that device.
 *
 * Time is virtual. setTimeout/clearTimeout are replaced by `clock` (so the 2 s write debounce
 * in lib/cloud.ts and the flushCloud timeout only pass when a test advances the clock) and Date
 * follows the same clock through vi's fake Date.
 *
 * The fake Firestore follows the real one where lib/cloud.ts depends on it:
 * - runTransaction: reads go to the server (one round trip each, run in parallel), the commit is
 *   one more hop and is atomic. It fails while the device is offline (nothing is queued) and,
 *   like Firestore's optimistic transactions, runs the function again when a document it read
 *   changed before the commit. Committed documents are delivered to every other online device
 *   one hop later, one listener call per document, in the order core, cards, errors.
 * - setDoc: a local write is shown at once to the writer's listeners with hasPendingWrites true;
 *   offline it is queued and sent when the device comes back online.
 * A new listener gets the current document first.
 */

type StoreModule = typeof import("@/lib/store");
type CloudModule = typeof import("@/lib/cloud");
type Actions = StoreModule["actions"];

const START = Date.parse("2026-10-20T08:00:00.000Z");
/** One network hop (client to server, or server to client), virtual ms. */
const LATENCY = 50;
/** lib/cloud.ts WRITE_DELAY_MS. */
const WRITE_DELAY = 2000;

/* ------------------------------------------------------------------ devices */

interface FakeUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

const LEARNER: FakeUser = { uid: "learner-1", displayName: "Learner", email: "learner@example.com", photoURL: null };

class FakeStorage {
  constructor(readonly map: Map<string, string>) {}
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

/** One browser: what lib/store.ts and lib/cloud.ts see as window, document and navigator. */
class Env {
  readonly window: EventTarget & { localStorage: FakeStorage };
  readonly document: EventTarget & { visibilityState: "visible" | "hidden" };
  readonly navigator = { onLine: true };
  online = true;
  /** A reloaded page: its timers, listeners and writes are gone. */
  dead = false;
  /** Writes made offline, sent when the device comes back online. */
  outbox: (() => void)[] = [];

  constructor(
    readonly name: string,
    readonly storage: Map<string, string>,
    public user: FakeUser | null,
  ) {
    this.window = Object.assign(new EventTarget(), { localStorage: new FakeStorage(storage) });
    this.document = Object.assign(new EventTarget(), { visibilityState: "visible" as "visible" | "hidden" });
  }
}

const als = new AsyncLocalStorage<Env>();
/** Browser globals touched outside any device: always a test harness bug. */
const leaks: string[] = [];

function globalProxy(pick: (e: Env) => object, label: string): object {
  const target = (key: PropertyKey): object | undefined => {
    const env = als.getStore();
    if (!env) {
      leaks.push(`${label}.${String(key)}`);
      return undefined;
    }
    return pick(env);
  };
  return new Proxy(
    {},
    {
      get(_, key) {
        const t = target(key);
        if (!t) return undefined;
        const v: unknown = Reflect.get(t, key, t);
        return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(t) : v;
      },
      set(_, key, value) {
        const t = target(key);
        return t ? Reflect.set(t, key, value) : true;
      },
      has(_, key) {
        const t = target(key);
        return t ? key in t : false;
      },
    },
  );
}

/* -------------------------------------------------------------------- clock */

const realSetImmediate = globalThis.setImmediate;
/** Lets every pending promise continuation run (the microtask queue drains before setImmediate). */
async function drain(): Promise<void> {
  for (let i = 0; i < 3; i++) await new Promise<void>((r) => realSetImmediate(r));
}

interface Timer {
  id: number;
  at: number;
  fn: () => void;
  env: Env | undefined;
}

class Clock {
  now = START;
  private nextId = 1;
  private timers: Timer[] = [];
  readonly errors: unknown[] = [];

  schedule(delay: number, fn: () => void, env: Env | undefined = als.getStore()): number {
    const id = this.nextId++;
    this.timers.push({ id, at: this.now + Math.max(0, delay), fn, env });
    return id;
  }

  clear(id: unknown): void {
    this.timers = this.timers.filter((t) => t.id !== id);
  }

  /** Runs everything due within `ms` of virtual time, in time order (ties: in scheduling order). */
  async advance(ms: number): Promise<void> {
    const target = this.now + ms;
    for (;;) {
      await drain();
      let next: Timer | undefined;
      for (const t of this.timers) if (t.at <= target && (!next || t.at < next.at)) next = t;
      if (!next) break;
      const due = next;
      this.timers = this.timers.filter((t) => t !== due);
      this.now = Math.max(this.now, due.at);
      vi.setSystemTime(this.now);
      if (due.env?.dead) continue;
      try {
        if (due.env) als.run(due.env, due.fn);
        else due.fn();
      } catch (e) {
        this.errors.push(e);
      }
    }
    this.now = target;
    vi.setSystemTime(target);
    await drain();
  }
}

/* -------------------------------------------------------------- fake Firebase */

interface Ref {
  path: string;
}

interface Snap {
  exists(): boolean;
  data(): Record<string, unknown> | undefined;
  metadata: { hasPendingWrites: boolean; fromCache: boolean };
}

interface Listener {
  env: Env;
  path: string;
  cb: (s: Snap) => void;
  active: boolean;
}

interface WriteLog {
  device: string;
  path: string;
  at: number;
}

interface TxLog {
  device: string;
  at: number;
  /** Documents written; empty for a transaction that found nothing to change. */
  paths: string[];
}

interface FakeTx {
  get(ref: Ref): Promise<Snap>;
  set(ref: Ref, data: Record<string, unknown>): FakeTx;
}

const snapshot = (json: string | undefined, pending: boolean): Snap => ({
  exists: () => json !== undefined,
  data: () => (json === undefined ? undefined : (JSON.parse(json) as Record<string, unknown>)),
  metadata: { hasPendingWrites: pending, fromCache: false },
});

const offlineError = () => Object.assign(new Error("offline"), { code: "unavailable" });

class Backend {
  readonly docs = new Map<string, string>();
  /** Bumped on every commit of a document, like Firestore's update time. */
  readonly versions = new Map<string, number>();
  readonly listeners: Listener[] = [];
  /** Every document write (a setDoc call, or a document set by a committed transaction), in order. */
  readonly writes: WriteLog[] = [];
  /** Every committed transaction, also those that wrote nothing. */
  readonly transactions: TxLog[] = [];
  /** Transaction attempts that found a document changed since they read it (and ran again). */
  conflicts = 0;
  /**
   * Whether the writer's own listeners hear its committed writes. Real Firestore delivers a
   * transaction's writes to the writer from the server (and does not deliver the server ack of a
   * setDoc, a metadata-only change); 1b runs scenario 1 without any echo, the harder case.
   */
  echoToWriter = true;

  listenersOf(path: string): Listener[] {
    return this.listeners.filter((l) => l.active && l.path === path && !l.env.dead);
  }

  /** One network hop for `env`: rejects offline, never settles on a reloaded page. */
  hop(env: Env, ms: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (env.dead) return;
      if (!env.online) {
        reject(offlineError());
        return;
      }
      clock.schedule(ms, () => (env.online ? resolve() : reject(offlineError())), env);
    });
  }

  commit(path: string, json: string, writer: Env, ack: () => void): void {
    this.docs.set(path, json);
    this.versions.set(path, (this.versions.get(path) ?? 0) + 1);
    ack();
    for (const l of this.listenersOf(path)) {
      if (l.env === writer && !this.echoToWriter) continue;
      // The writer hears the server echo right away; other devices one hop later.
      clock.schedule(
        l.env === writer ? 0 : LATENCY,
        () => {
          if (l.active && l.env.online) l.cb(snapshot(json, false));
        },
        l.env,
      );
    }
  }

  firestore(env: Env) {
    return {
      doc: (_db: unknown, ...segments: string[]): Ref => ({ path: segments.join("/") }),
      getDoc: (ref: Ref): Promise<Snap> =>
        new Promise<Snap>((resolve, reject) => {
          if (!env.online) {
            reject(Object.assign(new Error("offline"), { code: "unavailable" }));
            return;
          }
          clock.schedule(2 * LATENCY, () => resolve(snapshot(this.docs.get(ref.path), false)), env);
        }),
      setDoc: (ref: Ref, data: Record<string, unknown>): Promise<void> => {
        if (env.dead) return new Promise<void>(() => undefined);
        const json = JSON.stringify(data);
        this.writes.push({ device: env.name, path: ref.path, at: clock.now });
        // Latency compensation: the writer's own listeners see the write at once, still pending.
        for (const l of this.listenersOf(ref.path).filter((x) => x.env === env)) {
          clock.schedule(0, () => l.active && l.cb(snapshot(json, true)), env);
        }
        return new Promise<void>((resolve) => {
          const send = () => clock.schedule(LATENCY, () => this.commit(ref.path, json, env, resolve), env);
          if (env.online) send();
          else env.outbox.push(send);
        });
      },
      runTransaction: async <T>(
        _db: unknown,
        fn: (tx: FakeTx) => Promise<T>,
        opts?: { maxAttempts?: number },
      ): Promise<T> => {
        for (let attempt = 0; attempt < (opts?.maxAttempts ?? 5); attempt++) {
          const readVersions = new Map<string, number>();
          const staged = new Map<string, string>();
          const tx: FakeTx = {
            get: async (ref) => {
              await this.hop(env, 2 * LATENCY);
              readVersions.set(ref.path, this.versions.get(ref.path) ?? 0);
              return snapshot(this.docs.get(ref.path), false);
            },
            set: (ref, data) => {
              staged.set(ref.path, JSON.stringify(data));
              return tx;
            },
          };
          const result = await fn(tx);
          await this.hop(env, LATENCY);
          // On the server, atomically: every document read must be unchanged, else run again.
          if ([...readVersions].some(([path, v]) => (this.versions.get(path) ?? 0) !== v)) {
            this.conflicts++;
            continue;
          }
          this.transactions.push({ device: env.name, at: clock.now, paths: [...staged.keys()] });
          for (const [path, json] of staged) {
            this.writes.push({ device: env.name, path, at: clock.now });
            this.commit(path, json, env, () => undefined);
          }
          await this.hop(env, LATENCY);
          return result;
        }
        throw Object.assign(new Error("too much contention"), { code: "aborted" });
      },
      onSnapshot: (ref: Ref, cb: (s: Snap) => void): (() => void) => {
        const l: Listener = { env, path: ref.path, cb, active: true };
        this.listeners.push(l);
        clock.schedule(
          LATENCY,
          () => {
            if (l.active && env.online) cb(snapshot(this.docs.get(ref.path), false));
          },
          env,
        );
        return () => {
          l.active = false;
        };
      },
      serverTimestamp: () => "server-time",
    };
  }

  auth(env: Env) {
    class GoogleAuthProvider {
      setCustomParameters(): void {}
    }
    return {
      GoogleAuthProvider,
      onAuthStateChanged: (_auth: unknown, cb: (u: FakeUser | null) => void) => {
        clock.schedule(0, () => cb(env.user), env);
        return () => undefined;
      },
      signInWithPopup: async () => {
        env.user = LEARNER;
        return { user: LEARNER };
      },
      signInWithRedirect: async () => undefined,
      getRedirectResult: async () => null,
      signOut: async () => {
        env.user = null;
      },
    };
  }

  /** The cloud copy, read the way lib/cloud.ts joins it. */
  state(uid = LEARNER.uid): AppState {
    const part = (p: string): Record<string, unknown> | undefined => {
      const json = this.docs.get(`users/${uid}/data/${p}`);
      return json === undefined ? undefined : (JSON.parse(json) as Record<string, unknown>);
    };
    return migrate({ ...part("core"), cards: part("cards")?.cards ?? {}, errors: part("errors")?.errors ?? {} });
  }
}

let clock: Clock;
let backend: Backend;

interface Device {
  name: string;
  env: Env;
  store: StoreModule;
  cloud: CloudModule;
  run<T>(fn: () => T): T;
}

async function device(
  name: string,
  opts: { storage?: Map<string, string>; user?: FakeUser | null; signedInBefore?: boolean } = {},
): Promise<Device> {
  const env = new Env(name, opts.storage ?? new Map(), opts.user ?? null);
  if (opts.signedInBefore) {
    env.user = opts.user ?? LEARNER;
    env.storage.set("b2sprint:cloud", "1");
  }
  const kit = {
    app: {},
    auth: {},
    db: {},
    authMod: backend.auth(env),
    fsMod: backend.firestore(env),
  } as unknown as FirebaseKit;
  vi.resetModules();
  vi.doMock("@/lib/firebase", () => ({ loadFirebase: () => Promise.resolve(kit) }));
  const [store, cloud] = await als.run(env, async () => {
    const s = await import("@/lib/store");
    const c = await import("@/lib/cloud");
    return [s, c] as const;
  });
  return { name, env, store, cloud, run: (fn) => als.run(env, fn) };
}

/* ------------------------------------------------------------------ helpers */

const act = (d: Device, fn: (a: Actions) => void): void => d.run(() => fn(d.store.actions));
const stateOf = (d: Device): AppState => d.run(() => d.store.getState());
const writeCount = (): number => backend.writes.length;
const txCount = (): number => backend.transactions.length;

/** Long enough for every debounce, commit and delivery started so far (and the ones they start). */
async function settle(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i++) await clock.advance(WRITE_DELAY + 10 * LATENCY);
}

/** Signs in with the Google popup (a device that was never signed in). */
async function signIn(d: Device): Promise<void> {
  const done = d.run(() => d.cloud.signIn());
  await clock.advance(10 * LATENCY);
  await done;
}

/** App start on a device that signed in before. */
async function resume(d: Device): Promise<void> {
  d.run(() => d.cloud.initCloud());
  await clock.advance(10 * LATENCY);
}

/** Starts the whole course over the way Settings does: reset, then write the cloud at once. */
async function startOver(d: Device): Promise<string> {
  act(d, (a) => a.reset());
  const flushed = d.run(() => d.cloud.flushCloud());
  await clock.advance(5 * LATENCY);
  await flushed;
  const at = stateOf(d).resetAt;
  if (!at) throw new Error("reset did not record a time");
  return at;
}

/** Reloads the page: same local storage and account, fresh modules, old listeners gone. */
async function reload(d: Device): Promise<Device> {
  d.env.dead = true;
  const fresh = await device(d.name, { storage: d.env.storage, user: d.env.user });
  await resume(fresh);
  return fresh;
}

function goOffline(d: Device): void {
  d.env.online = false;
  d.env.navigator.onLine = false;
  d.run(() => d.env.window.dispatchEvent(new Event("offline")));
}

/** Back online: queued writes go out first, listeners resync, then the browser fires "online". */
function goOnline(d: Device): void {
  d.env.online = true;
  d.env.navigator.onLine = true;
  d.run(() => {
    for (const send of d.env.outbox.splice(0)) send();
    for (const l of backend.listeners.filter((x) => x.env === d.env && x.active)) {
      clock.schedule(2 * LATENCY, () => {
        if (l.active && d.env.online) l.cb(snapshot(backend.docs.get(l.path), false));
      });
    }
    d.env.window.dispatchEvent(new Event("online"));
  });
}

/** A day of learning: some steps and one wrong answer (an error entry and a mistake card). */
function learn(a: Actions, day: number, steps: string[], mistake: string): void {
  a.startDay(day);
  steps.forEach((step, i) => a.completeStep(day, step, steps[i + 1] ?? null));
  a.recordAnswer({
    day,
    key: mistake,
    correct: false,
    category: "perfect",
    prompt: `${mistake}: I ___ here since May.`,
    given: "am",
    right: "have been",
    rule: "since + present perfect",
  });
}

/** Whether a mistake made with learn() is still anywhere in the state. */
function remembers(s: AppState, mistake: string): boolean {
  return s.errors[mistake] !== undefined || s.cards[`m:${mistake}`] !== undefined;
}

/** Phone and laptop, both signed in, both holding the union of their progress. */
async function twoSyncedDevices(): Promise<{ phone: Device; laptop: Device }> {
  const phone = await device("phone");
  act(phone, (a) => {
    learn(a, 1, ["be:rule:0", "be:rule:1"], "d1-phone");
    learn(a, 2, ["x:rule:0"], "d2-phone");
  });
  await signIn(phone);
  await settle();

  const laptop = await device("laptop");
  act(laptop, (a) => learn(a, 1, ["be:mistakes"], "d1-laptop"));
  await signIn(laptop);
  await settle();

  for (const s of [stateOf(phone), stateOf(laptop), backend.state()]) {
    expect(remembers(s, "d1-phone") && remembers(s, "d2-phone") && remembers(s, "d1-laptop")).toBe(true);
    expect(s.days[1].doneSteps).toEqual(expect.arrayContaining(["be:rule:0", "be:rule:1", "be:mistakes"]));
  }
  expect(phone.run(() => phone.cloud.useCloud)).toBeTypeOf("function");
  return { phone, laptop };
}

/* -------------------------------------------------------------------- setup */

beforeEach(() => {
  clock = new Clock();
  backend = new Backend();
  leaks.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
  vi.stubGlobal("window", globalProxy((e) => e.window, "window"));
  vi.stubGlobal("document", globalProxy((e) => e.document, "document"));
  vi.stubGlobal("navigator", globalProxy((e) => e.navigator, "navigator"));
  vi.stubGlobal("setTimeout", (fn: () => void, ms?: number) => clock.schedule(ms ?? 0, fn));
  vi.stubGlobal("clearTimeout", (id: unknown) => clock.clear(id));
});

afterEach(() => {
  for (const l of backend.listeners) l.env.dead = true;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.doUnmock("@/lib/firebase");
  vi.resetModules();
  expect(clock.errors).toEqual([]);
  expect(leaks).toEqual([]);
});

/* -------------------------------------------------------------------- tests */

const OLD = ["d1-phone", "d2-phone", "d1-laptop"];
const PART_PATHS = ["core", "cards", "errors"].map((p) => `users/${LEARNER.uid}/data/${p}`);
const txBy = (d: Device): number => backend.transactions.filter((t) => t.device === d.name).length;
const activeListeners = (d: Device): number => backend.listeners.filter((l) => l.env === d.env && l.active).length;

/** Nothing more is written or even read over many debounce windows. */
async function expectQuiet(): Promise<void> {
  const writes = writeCount();
  const txs = txCount();
  await settle(10);
  expect(writeCount()).toBe(writes);
  expect(txCount()).toBe(txs);
}

/** Writes like a copy of the app from before every document carried the reset times: blind setDoc. */
function legacyWrite(s: AppState): void {
  const env = new Env("old-app", new Map(), LEARNER);
  const fs = backend.firestore(env);
  const { cards, errors, ...core } = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
  delete core.resetAt;
  delete core.dayResets;
  void fs.setDoc({ path: PART_PATHS[0] }, core);
  void fs.setDoc({ path: PART_PATHS[1] }, { cards });
  void fs.setDoc({ path: PART_PATHS[2] }, { errors });
}

describe("cloud sync across devices", () => {
  /*
   * The three documents of one write reach another device one by one (core first here). A device
   * that joined a new core (reset) to the cards and errors documents it remembered from before
   * the reset used to bring the old cards and mistakes back, to itself and then to everyone.
   * Every document now carries the reset times, and each is brought up to them on its own.
   */

  it("1. starting over on the phone empties the cloud and the laptop for good", async () => {
    const { phone, laptop } = await twoSyncedDevices();
    await clock.advance(60_000);

    const resetAt = await startOver(phone);
    expect(backend.state().resetAt).toBe(resetAt);
    expect(isEmptyProgress(backend.state())).toBe(true);

    await settle();
    for (const s of [stateOf(phone), stateOf(laptop), backend.state()]) {
      expect(s.resetAt).toBe(resetAt);
      expect(isEmptyProgress(s)).toBe(true);
    }

    // More snapshots and writes: settings change on both, then the laptop reloads.
    act(laptop, (a) => a.updateSettings({ theme: "dark" }));
    await settle();
    act(phone, (a) => a.updateSettings({ sound: true }));
    await settle();
    const reloaded = await reload(laptop);
    await settle();
    for (const s of [stateOf(phone), stateOf(reloaded), backend.state()]) {
      expect(s.resetAt).toBe(resetAt);
      expect(isEmptyProgress(s)).toBe(true);
      expect(s.settings.sound).toBe(true);
      expect(s.settings.theme).toBe("dark");
    }
    await expectQuiet();
  });

  it("1b. same as 1 when the writer gets no echo of its own writes", async () => {
    backend.echoToWriter = false;
    const { phone, laptop } = await twoSyncedDevices();
    await clock.advance(60_000);
    const resetAt = await startOver(phone);
    await settle();
    for (const s of [stateOf(phone), stateOf(laptop), backend.state()]) {
      expect(s.resetAt).toBe(resetAt);
      expect(isEmptyProgress(s)).toBe(true);
    }
    act(laptop, (a) => a.updateSettings({ theme: "dark" }));
    await settle();
    act(phone, (a) => a.updateSettings({ sound: true }));
    await settle();
    for (const s of [stateOf(phone), stateOf(laptop), backend.state()]) {
      expect(isEmptyProgress(s)).toBe(true);
      expect(s.settings.theme).toBe("dark");
      expect(s.settings.sound).toBe(true);
    }
    await expectQuiet();
  });

  it("1a. days, steps and position are cleared everywhere", async () => {
    const { phone, laptop } = await twoSyncedDevices();
    await clock.advance(60_000);
    const resetAt = await startOver(phone);
    await settle(5);
    for (const s of [stateOf(phone), stateOf(laptop), backend.state()]) {
      expect(s.resetAt).toBe(resetAt);
      expect(s.days).toEqual({});
      expect(s.position).toBeNull();
      expect(s.diagnostic).toBeNull();
    }
  });

  it("2. progress made on the laptop after the reset reaches the phone and is kept", async () => {
    const { phone, laptop } = await twoSyncedDevices();
    await clock.advance(60_000);
    const resetAt = await startOver(phone);
    await settle();

    await clock.advance(60_000);
    act(laptop, (a) => learn(a, 1, ["be:rule:0"], "d1-new"));
    await settle();
    for (const s of [stateOf(phone), stateOf(laptop), backend.state()]) {
      expect(s.resetAt).toBe(resetAt);
      expect(remembers(s, "d1-new")).toBe(true);
      expect(s.days[1].doneSteps).toContain("be:rule:0");
    }

    // Still there after more rounds and a reload of the phone.
    act(phone, (a) => a.updateSettings({ theme: "light" }));
    await settle();
    const reloaded = await reload(phone);
    await settle();
    for (const s of [stateOf(reloaded), stateOf(laptop), backend.state()]) {
      expect(remembers(s, "d1-new")).toBe(true);
      expect(s.days[1].doneSteps).toContain("be:rule:0");
      expect(s.resetAt).toBe(resetAt);
    }
  });

  it("3. a stale device coming back online keeps the reset and only its own newer work, without a write loop", async () => {
    const { phone, laptop } = await twoSyncedDevices();
    const tablet = await device("tablet", { signedInBefore: true });
    await resume(tablet);
    await settle();
    expect(remembers(stateOf(tablet), "d1-phone")).toBe(true);

    goOffline(tablet);
    await clock.advance(60_000);
    const resetAt = await startOver(phone);
    await settle();

    // Offline, the tablet still has the old progress and adds to it; it comes back online
    // before its debounced write, so the "online" handler sends it.
    act(tablet, (a) => learn(a, 3, ["p:rule:0"], "d3-tablet"));
    await clock.advance(500);
    const before = writeCount();
    goOnline(tablet);
    await clock.advance(5 * LATENCY);
    expect(backend.writes.slice(before).some((w) => w.device === "tablet")).toBe(true);

    await settle(10);
    const writes = writeCount() - before;
    // The reset clears what was made before it (lib/sync.ts), the day 3 the tablet started
    // offline after it is kept and reaches everyone.
    for (const s of [stateOf(phone), stateOf(laptop), stateOf(tablet), backend.state()]) {
      expect(s.resetAt).toBe(resetAt);
      expect(Object.keys(s.days)).toEqual(["3"]);
      expect(s.days[3].doneSteps).toEqual(["p:rule:0"]);
      expect(remembers(s, "d3-tablet")).toBe(true);
      for (const old of OLD) expect(remembers(s, old)).toBe(false);
    }
    expect(writes).toBeLessThanOrEqual(30);
    await expectQuiet();
  });

  it("3a. a stale device whose write falls due offline queues nothing and cannot erase the reset later", async () => {
    const { phone, laptop } = await twoSyncedDevices();
    const tablet = await device("tablet", { signedInBefore: true });
    await resume(tablet);
    await settle();

    goOffline(tablet);
    await clock.advance(60_000);
    const resetAt = await startOver(phone);
    await settle();

    // Offline, the tablet goes on with a day it started before the reset and starts a new one.
    // Its debounced write and a flush (the page hidden) fall due while it is still offline.
    const before = writeCount();
    act(tablet, (a) => {
      a.completeStep(1, "be:rule:2", null);
      learn(a, 3, ["p:rule:0"], "d3-tablet");
    });
    await clock.advance(3 * WRITE_DELAY);
    const flushed = tablet.run(() => tablet.cloud.flushCloud());
    await clock.advance(3000);
    await flushed;
    expect(backend.writes.slice(before)).toEqual([]);
    // A setDoc would sit here and be replayed as a blind overwrite once online.
    expect(tablet.env.outbox).toEqual([]);
    expect(isEmptyProgress(backend.state())).toBe(true);

    goOnline(tablet);
    await settle(10);
    expect(writeCount() - before).toBeLessThanOrEqual(30);
    for (const s of [stateOf(phone), stateOf(laptop), stateOf(tablet), backend.state()]) {
      expect(s.resetAt).toBe(resetAt);
      // Day 1 was started before the reset: the step added to it offline goes with it.
      expect(Object.keys(s.days)).toEqual(["3"]);
      expect(s.days[3].doneSteps).toEqual(["p:rule:0"]);
      expect(remembers(s, "d3-tablet")).toBe(true);
      for (const old of OLD) expect(remembers(s, old)).toBe(false);
    }
    await expectQuiet();
  });

  it("4. starting one day over on the phone empties that day on the laptop and keeps the rest", async () => {
    const { phone, laptop } = await twoSyncedDevices();
    await clock.advance(60_000);

    act(phone, (a) => a.resetDay(2));
    const flushed = phone.run(() => phone.cloud.flushCloud());
    await clock.advance(5 * LATENCY);
    await flushed;
    const dayResetAt = stateOf(phone).dayResets[2];
    expect(dayResetAt).toBeTruthy();

    await settle(5);
    for (const s of [stateOf(phone), stateOf(laptop), backend.state()]) {
      expect(s.dayResets[2]).toBe(dayResetAt);
      expect(dayHasProgress(s, 2)).toBe(false);
      expect(remembers(s, "d2-phone")).toBe(false);
      expect(remembers(s, "d1-phone") && remembers(s, "d1-laptop")).toBe(true);
      expect(s.days[1].doneSteps).toEqual(expect.arrayContaining(["be:rule:0", "be:rule:1", "be:mistakes"]));
    }
    await expectQuiet();
  });

  it("4a. the same without a flush: the debounced write carries the day reset", async () => {
    const { phone, laptop } = await twoSyncedDevices();
    await clock.advance(60_000);
    act(phone, (a) => a.resetDay(2));
    await settle(5);
    const dayResetAt = stateOf(phone).dayResets[2];
    for (const s of [stateOf(phone), stateOf(laptop), backend.state()]) {
      expect(s.dayResets[2]).toBe(dayResetAt);
      // An open day stays open after starting over (lib/progress.ts resetDay), with nothing done.
      expect(s.days[2]?.doneSteps ?? []).toEqual([]);
      expect(dayHasProgress(s, 2)).toBe(false);
      expect(remembers(s, "d1-phone") && remembers(s, "d1-laptop")).toBe(true);
      expect(s.days[1].doneSteps).toEqual(expect.arrayContaining(["be:rule:0", "be:rule:1", "be:mistakes"]));
    }
  });

  it("5. the same steps done in a different order do not make two devices write back and forth", async () => {
    const phone = await device("phone");
    act(phone, (a) => {
      a.completeStep(1, "be:rule:0", null);
      a.completeStep(1, "be:rule:1", null);
    });
    const laptop = await device("laptop");
    act(laptop, (a) => {
      a.completeStep(1, "be:rule:1", null);
      a.completeStep(1, "be:rule:0", null);
    });
    await signIn(phone);
    await settle();
    await signIn(laptop);

    const start = writeCount();
    await settle(2);
    const afterSync = writeCount();
    const txAfterSync = txCount();
    expect(afterSync - start).toBeLessThanOrEqual(6);
    // Five more debounce windows: nobody writes, nobody even reads.
    for (let i = 0; i < 5; i++) await clock.advance(WRITE_DELAY + LATENCY);
    expect(writeCount()).toBe(afterSync);
    expect(txCount()).toBe(txAfterSync);

    // A change on each side: one write each, still no back and forth.
    act(phone, (a) => a.completeStep(1, "be:rule:2", null));
    await settle();
    act(laptop, (a) => a.updateSettings({ theme: "dark" }));
    await settle();
    await expectQuiet();

    for (const s of [stateOf(phone), stateOf(laptop), backend.state()]) {
      expect([...s.days[1].doneSteps].sort()).toEqual(["be:rule:0", "be:rule:1", "be:rule:2"]);
    }
  });

  it.each(["visibilitychange", "pagehide"] as const)(
    "6. starting over and hiding the page at once (%s) writes the cloud before the debounce",
    async (event) => {
      const phone = await device("phone");
      act(phone, (a) => learn(a, 1, ["be:rule:0"], "d1-phone"));
      await signIn(phone);
      await settle();
      expect(remembers(backend.state(), "d1-phone")).toBe(true);

      act(phone, (a) => a.reset());
      phone.run(() => {
        if (event === "visibilitychange") {
          phone.env.document.visibilityState = "hidden";
          phone.env.document.dispatchEvent(new Event("visibilitychange"));
        } else {
          phone.env.window.dispatchEvent(new Event("pagehide"));
        }
      });
      // Well under the 2 s debounce: only the hide handler can have written.
      await clock.advance(3 * LATENCY);
      const cloud = backend.state();
      expect(cloud.resetAt).toBe(stateOf(phone).resetAt);
      expect(cloud.resetAt).not.toBeNull();
      expect(cloud.days).toEqual({});
      expect(isEmptyProgress(cloud)).toBe(true);
    },
  );

  it("7. a fresh device signing in drops its progress from before the cloud's newer reset", async () => {
    // The tablet learns on its own first, never signed in.
    const tablet = await device("tablet");
    act(tablet, (a) => learn(a, 1, ["be:rule:0", "be:rule:1"], "d1-tablet"));
    await clock.advance(60_000);

    // Later the phone learns, syncs, starts over and learns again; that is what the cloud holds.
    const phone = await device("phone");
    act(phone, (a) => learn(a, 2, ["x:rule:0"], "d2-phone-old"));
    await signIn(phone);
    await settle();
    const resetAt = await startOver(phone);
    await clock.advance(60_000);
    act(phone, (a) => learn(a, 1, ["be:mistakes"], "d1-after-reset"));
    await settle();

    await signIn(tablet);
    await settle();
    for (const s of [stateOf(tablet), stateOf(phone), backend.state()]) {
      expect(s.resetAt).toBe(resetAt);
      expect(remembers(s, "d1-tablet")).toBe(false);
      expect(remembers(s, "d2-phone-old")).toBe(false);
      expect(s.days[2]).toBeUndefined();
      expect(remembers(s, "d1-after-reset")).toBe(true);
      expect(s.days[1].doneSteps).toEqual(["be:mistakes"]);
    }
    await expectQuiet();
  });

  it("7b. a device that never synced keeps what it made after the cloud's reset and loses what it made before", async () => {
    const tablet = await device("tablet");
    act(tablet, (a) => learn(a, 3, ["p:rule:0"], "d3-tablet-before"));
    await clock.advance(60_000);

    const phone = await device("phone");
    act(phone, (a) => learn(a, 2, ["x:rule:0"], "d2-old"));
    await signIn(phone);
    await settle();
    const resetAt = await startOver(phone);
    await settle();

    await clock.advance(60_000);
    act(tablet, (a) => learn(a, 1, ["be:rule:0"], "d1-tablet-later"));
    await signIn(tablet);
    await settle();
    // lib/sync.ts: a copy that has not seen the reset gives up what it made before it, by date.
    for (const s of [stateOf(tablet), stateOf(phone), backend.state()]) {
      expect(s.resetAt).toBe(resetAt);
      expect(remembers(s, "d1-tablet-later")).toBe(true);
      expect(remembers(s, "d3-tablet-before")).toBe(false);
      expect(remembers(s, "d2-old")).toBe(false);
      expect(Object.keys(s.days)).toEqual(["1"]);
      expect(s.days[1].doneSteps).toEqual(["be:rule:0"]);
    }
    await expectQuiet();
  });

  it("8. two devices writing at the same moment: the later transaction runs again and both changes stay", async () => {
    const { phone, laptop } = await twoSyncedDevices();
    await clock.advance(60_000);
    const conflicts = backend.conflicts;
    // Same instant, so both debounced transactions read the same documents.
    act(phone, (a) => learn(a, 4, ["q:rule:0"], "d4-phone"));
    act(laptop, (a) => learn(a, 5, ["r:rule:0"], "d5-laptop"));
    await settle();
    expect(backend.conflicts).toBeGreaterThan(conflicts);
    for (const s of [stateOf(phone), stateOf(laptop), backend.state()]) {
      expect(remembers(s, "d4-phone") && remembers(s, "d5-laptop")).toBe(true);
      expect(s.days[4].doneSteps).toEqual(["q:rule:0"]);
      expect(s.days[5].doneSteps).toEqual(["r:rule:0"]);
      for (const old of OLD) expect(remembers(s, old)).toBe(true);
    }
    await expectQuiet();
  });

  it.each(["sign-in first", "resumed session first"] as const)(
    "9. signing in while the resumed session starts (%s) runs one sync only",
    async (order) => {
      const phone = await device("phone");
      act(phone, (a) => learn(a, 1, ["be:rule:0"], "d1-phone"));
      await signIn(phone);
      await settle();

      // The laptop signed in before; the app starts and the learner taps "Sign in" at once.
      const laptop = await device("laptop", { signedInBefore: true });
      act(laptop, (a) => learn(a, 2, ["x:rule:0"], "d2-laptop"));
      let signing: Promise<void>;
      if (order === "sign-in first") {
        signing = laptop.run(() => laptop.cloud.signIn());
        laptop.run(() => laptop.cloud.initCloud());
      } else {
        laptop.run(() => laptop.cloud.initCloud());
        await clock.advance(LATENCY);
        signing = laptop.run(() => laptop.cloud.signIn());
      }
      await clock.advance(10 * LATENCY);
      await signing;
      await settle();
      expect(activeListeners(laptop)).toBe(3);

      // One change, one transaction: no second set of writers.
      const before = txBy(laptop);
      act(laptop, (a) => a.updateSettings({ theme: "dark" }));
      await settle();
      expect(txBy(laptop) - before).toBe(1);
      for (const s of [stateOf(phone), stateOf(laptop), backend.state()]) {
        expect(remembers(s, "d1-phone") && remembers(s, "d2-laptop")).toBe(true);
        expect(s.settings.theme).toBe("dark");
      }

      // Signing out stops it all; signing in again starts exactly one sync.
      await laptop.run(() => laptop.cloud.signOut());
      expect(activeListeners(laptop)).toBe(0);
      await signIn(laptop);
      await settle();
      expect(activeListeners(laptop)).toBe(3);
      await expectQuiet();
    },
  );

  it("10. documents from an older version (no reset times in cards and errors) still merge, and get them", async () => {
    const old = await device("old");
    act(old, (a) => learn(a, 1, ["be:rule:0"], "d1-old"));
    legacyWrite(stateOf(old));
    await settle();
    expect(JSON.parse(backend.docs.get(PART_PATHS[1]) as string)).not.toHaveProperty("resetAt");

    const phone = await device("phone");
    act(phone, (a) => learn(a, 2, ["x:rule:0"], "d2-phone"));
    await signIn(phone);
    await settle();
    for (const s of [stateOf(phone), backend.state()]) {
      expect(remembers(s, "d1-old") && remembers(s, "d2-phone")).toBe(true);
    }
    for (const path of PART_PATHS) {
      const data = JSON.parse(backend.docs.get(path) as string) as Record<string, unknown>;
      expect(data).toHaveProperty("resetAt", null);
      expect(data).toHaveProperty("dayResets", {});
    }
    await expectQuiet();
  });

  it("10b. an older version overwriting the cloud with its copy from before the reset: the reset is put back", async () => {
    const { phone, laptop } = await twoSyncedDevices();
    const beforeReset = stateOf(phone);
    await clock.advance(60_000);
    const resetAt = await startOver(phone);
    await settle();

    // An old tab that never heard of the reset writes all three documents, core first.
    legacyWrite(beforeReset);
    await settle(5);
    for (const s of [stateOf(phone), stateOf(laptop), backend.state()]) {
      expect(s.resetAt).toBe(resetAt);
      expect(isEmptyProgress(s)).toBe(true);
    }
    for (const path of PART_PATHS) {
      expect(JSON.parse(backend.docs.get(path) as string)).toHaveProperty("resetAt", resetAt);
    }
    await expectQuiet();
  });
});
