import { useSyncExternalStore } from "react";
import { loadFirebase, type FirebaseKit } from "@/lib/firebase";
import { migrate } from "@/lib/progress";
import { mergeStates, missesResets } from "@/lib/sync";
import { getState, replaceState, subscribe as subscribeStore } from "@/lib/store";
import type { AppState } from "@/types/state";

/**
 * Cloud sync for signed-in learners. The device copy stays the source of truth for the UI;
 * the cloud copy lives in three documents under users/{uid}/data/{core|cards|errors} and is
 * merged both ways with mergeStates (union of progress, latest settings), so nothing is lost
 * when two devices were used offline.
 *
 * Every write is one transaction: read the three documents, merge them with the local state,
 * write back only the documents that change. A write therefore never erases what another device
 * wrote meanwhile (a reset above all). Transactions fail offline instead of being queued as blind
 * overwrites; the device remembers that it has unsent changes and tries again when it is back
 * online, on the next change and when the page is hidden. Every document carries the reset times,
 * so a device that has received only some of the documents of a write cannot bring cleared cards
 * or mistakes back.
 */

export type CloudStatus = "signed-out" | "signing-in" | "syncing" | "synced" | "offline" | "error";

export interface CloudUser {
  uid: string;
  name: string | null;
  email: string | null;
  photo: string | null;
}

export interface CloudState {
  status: CloudStatus;
  user: CloudUser | null;
  lastSyncAt: string | null;
  /** Human-readable problem, shown quietly in Settings. */
  problem: string | null;
}

const SIGNED_IN_FLAG = "b2sprint:cloud";
const WRITE_DELAY_MS = 2000;

let cloud: CloudState = { status: "signed-out", user: null, lastSyncAt: null, problem: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<CloudState>) => {
  cloud = { ...cloud, ...patch };
  listeners.forEach((l) => l());
};

export function useCloud(): CloudState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => cloud,
    () => cloud,
  );
}

type Part = "core" | "cards" | "errors";
const PARTS: Part[] = ["core", "cards", "errors"];
type Doc = Record<string, unknown>;
type Docs = Partial<Record<Part, Doc>>;

/** JSON with object keys sorted: Firestore returns map keys in its own order, not ours. */
function canonical(v: unknown): string {
  return JSON.stringify(v, (_key, value: unknown) =>
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, (value as Doc)[k]]),
        )
      : value,
  );
}

function split(s: AppState): Record<Part, Doc> {
  const { cards, errors, ...core } = s;
  // Every document carries the reset times: see join.
  const stamps = { resetAt: s.resetAt, dayResets: s.dayResets };
  // JSON round trip drops undefined, which Firestore rejects.
  const clean = (v: unknown) => JSON.parse(JSON.stringify(v)) as Doc;
  return { core: clean(core), cards: clean({ cards, ...stamps }), errors: clean({ errors, ...stamps }) };
}

/** The reset times a document says it has seen (none in documents from older versions). */
const stampsOf = (d: Doc | undefined) => ({ resetAt: d?.resetAt, dayResets: d?.dayResets });

function join(docs: Docs): AppState | null {
  if (!docs.core) return null;
  // The documents of one write can arrive one by one, so each is brought up to the resets on its
  // own before the union: a newer core must not vouch for older cards or mistakes. Validated like
  // local storage: a hand-edited or half-written document must not break the merge. The cards and
  // errors copies have no updatedAt (epoch), so settings, position and streak come from core.
  const base = migrate({ ...docs.core, cards: {}, errors: {} });
  const cards = migrate({ ...stampsOf(docs.cards), cards: docs.cards?.cards });
  const errors = migrate({ ...stampsOf(docs.errors), errors: docs.errors?.errors });
  return mergeStates(mergeStates(base, cards), errors);
}

let stopSync: (() => void) | null = null;
let flushNow: (() => Promise<void>) | null = null;
/** The running sync. A second start for the same account (sign-in racing the auth listener) joins it. */
let session: { uid: string; resync: () => Promise<void> } | null = null;

/**
 * Writes the local state to the cloud now instead of after the usual short delay. Call it after
 * starting over, so closing the tab right away cannot leave the old progress in the account.
 */
export function flushCloud(timeoutMs = 2500): Promise<void> {
  if (!flushNow) return Promise.resolve();
  // A transaction retries for a while before it gives up offline: never block the screen on it.
  return Promise.race([flushNow(), new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))]);
}

function errorMessage(e: unknown): string {
  const code = typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : "";
  if (code.includes("popup-closed") || code.includes("cancelled-popup")) return "";
  if (code.includes("operation-not-allowed") || code.includes("configuration-not-found")) {
    return "Google sign-in is not switched on for this app yet.";
  }
  if (code.includes("unauthorized-domain")) return "This address is not allowed to sign in yet.";
  if (code.includes("network") || code.includes("unavailable")) {
    return "No connection. Your progress is safe on this device.";
  }
  return "Sign-in did not work. Please try again.";
}

function startSync(k: FirebaseKit, uid: string): Promise<void> {
  if (session?.uid === uid) {
    set({ status: "syncing", problem: null });
    return session.resync();
  }
  stopSync?.();
  const { doc, onSnapshot, runTransaction } = k.fsMod;
  const ref = (p: Part) => doc(k.db, "users", uid, "data", p);
  /** What this device knows the cloud holds, per document. */
  const remote: Docs = {};
  /** Snapshots received per document: a write must not replace a newer one in `remote`. */
  const received: Record<Part, number> = { core: 0, cards: 0, errors: 0 };
  /** Set once this sync is stopped or replaced: work still in flight must not touch anything. */
  let stopped = false;
  /** The cloud may not have the latest local changes yet (the first sync has not run either). */
  let dirty = true;
  /** Set while this module replaces the local state with a merge: that is no change to send. */
  let applying = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let resetCheck: ReturnType<typeof setTimeout> | null = null;
  set({ status: "syncing", problem: null });

  const apply = (s: AppState) => {
    applying = true;
    try {
      replaceState(s);
    } finally {
      applying = false;
    }
  };

  /** One atomic read-merge-write of the three documents. Never rejects. */
  const writeOnce = async (): Promise<void> => {
    if (stopped) return;
    dirty = false;
    const before = { ...received };
    try {
      // Firestore runs this again when another device wrote between the reads and the commit.
      const out = await runTransaction(k.db, async (tx) => {
        const snaps = await Promise.all(PARTS.map((p) => tx.get(ref(p))));
        if (stopped) throw new Error("sync stopped");
        const read: Docs = {};
        snaps.forEach((snap, i) => {
          if (snap.exists()) read[PARTS[i]] = snap.data();
        });
        const local = getState();
        const fromCloud = join(read);
        const merged = fromCloud ? mergeStates(local, fromCloud) : local;
        const parts = split(merged);
        const now: Docs = {};
        for (const p of PARTS) {
          const was = read[p];
          if (was && canonical(was) === canonical(parts[p])) {
            now[p] = was;
          } else {
            tx.set(ref(p), parts[p]);
            now[p] = parts[p];
          }
        }
        return { local, merged, now };
      });
      if (stopped) return;
      // What the cloud holds now, unless a snapshot that came in meanwhile already said so.
      for (const p of PARTS) if (received[p] === before[p]) remote[p] = out.now[p];
      const current = getState();
      // A change made while the transaction ran stays (it is dirty and goes with the next write).
      const next = current === out.local ? out.merged : mergeStates(current, out.merged);
      if (canonical(next) !== canonical(current)) apply(next);
      set({ status: "synced", lastSyncAt: new Date().toISOString(), problem: null });
    } catch (e) {
      if (stopped) return;
      dirty = true;
      set({ status: navigator.onLine ? "error" : "offline", problem: errorMessage(e) || null });
    }
  };

  // One transaction at a time; calls made while one waits to start share it.
  let tail: Promise<void> = Promise.resolve();
  let queued: Promise<void> | null = null;
  const write = (): Promise<void> => {
    if (queued) return queued;
    const run = tail.then(() => {
      queued = null;
      return writeOnce();
    });
    queued = run;
    tail = run;
    return run;
  };

  /** Sends unsent changes now; otherwise waits for the write already running, if any. */
  const flush = (): Promise<void> => {
    if (timer) clearTimeout(timer);
    timer = null;
    return dirty ? write() : tail;
  };

  // Remote → local: changes from other devices.
  const unsubs = PARTS.map((p) =>
    onSnapshot(ref(p), (snap) => {
      if (stopped || snap.metadata.hasPendingWrites || !snap.exists()) return;
      received[p]++;
      remote[p] = snap.data();
      const fromCloud = join(remote);
      if (!fromCloud) return;
      const local = getState();
      const merged = mergeStates(local, fromCloud);
      if (canonical(merged) !== canonical(local)) apply(merged);
      // A document without a reset this device knows of (another device's stale copy, an older
      // version of the app): put the reset back at once. The documents of one write arrive one
      // by one, so look after the others have had a chance to come in.
      resetCheck ??= setTimeout(() => {
        resetCheck = null;
        const s = getState();
        const stale = PARTS.some((q) => remote[q] !== undefined && missesResets(migrate(stampsOf(remote[q])), s));
        if (!stopped && stale) void write();
      }, 0);
      if (!dirty && !snap.metadata.fromCache) set({ status: "synced", lastSyncAt: new Date().toISOString() });
    }),
  );

  // Local → remote: debounced.
  const unsubStore = subscribeStore(() => {
    if (applying) return;
    dirty = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void write();
    }, WRITE_DELAY_MS);
  });

  // Back online: send what could not be sent (offline transactions fail, they are not queued).
  const onOnline = () => void flush();
  window.addEventListener("online", onOnline);

  // Leaving the page with a write still waiting: send it now, not never.
  const onHide = (e: Event) => {
    if (e.type === "pagehide" || document.visibilityState === "hidden") void flush();
  };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onHide);

  const mine = { uid, resync: write };
  const stop = () => {
    stopped = true;
    unsubs.forEach((u) => u());
    unsubStore();
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", onHide);
    if (timer) clearTimeout(timer);
    if (resetCheck) clearTimeout(resetCheck);
    if (session === mine) session = null;
    if (stopSync === stop) {
      stopSync = null;
      flushNow = null;
    }
  };
  stopSync = stop;
  flushNow = flush;
  session = mine;
  // First sync: the cloud gets what this device did meanwhile, this device gets the cloud.
  return write();
}

function toUser(u: { uid: string; displayName: string | null; email: string | null; photoURL: string | null }): CloudUser {
  return { uid: u.uid, name: u.displayName, email: u.email, photo: u.photoURL };
}

let started = false;
/** The auth listener that notices a sign-out (in another tab too) is registered once. */
let watchingAuth = false;

/** Called once on app start: resumes sync only for learners who signed in before. */
export function initCloud(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  let flagged = false;
  try {
    flagged = window.localStorage.getItem(SIGNED_IN_FLAG) === "1";
  } catch {
    flagged = false;
  }
  if (!flagged) return;
  set({ status: "syncing" });
  loadFirebase()
    .then((k) => {
      watchingAuth = true;
      k.authMod.onAuthStateChanged(k.auth, (u) => {
        if (u) {
          set({ user: toUser(u) });
          void startSync(k, u.uid);
        } else {
          stopSync?.();
          set({ status: "signed-out", user: null });
        }
      });
      k.authMod.getRedirectResult(k.auth).catch((e: unknown) => set({ status: "error", problem: errorMessage(e) || null }));
    })
    .catch(() => set({ status: "offline" }));
}

export async function signIn(): Promise<void> {
  set({ status: "signing-in", problem: null });
  try {
    const k = await loadFirebase();
    const provider = new k.authMod.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      window.localStorage.setItem(SIGNED_IN_FLAG, "1");
    } catch {
      // private mode: sync still works for this tab
    }
    let cred;
    try {
      cred = await k.authMod.signInWithPopup(k.auth, provider);
    } catch (e) {
      const code = typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : "";
      if (code.includes("popup-blocked") || code.includes("operation-not-supported")) {
        await k.authMod.signInWithRedirect(k.auth, provider);
        return;
      }
      throw e;
    }
    set({ user: toUser(cred.user) });
    // A first sign-in in this tab (initCloud found no earlier sign-in and registered nothing).
    if (!watchingAuth) {
      watchingAuth = true;
      started = true;
      k.authMod.onAuthStateChanged(k.auth, (u) => {
        if (!u) {
          stopSync?.();
          set({ status: "signed-out", user: null });
        }
      });
    }
    await startSync(k, cred.user.uid);
  } catch (e) {
    const message = errorMessage(e);
    try {
      window.localStorage.removeItem(SIGNED_IN_FLAG);
    } catch {
      // ignore
    }
    set({ status: "signed-out", user: null, problem: message || null });
  }
}

export async function signOut(): Promise<void> {
  try {
    window.localStorage.removeItem(SIGNED_IN_FLAG);
  } catch {
    // ignore
  }
  stopSync?.();
  const k = await loadFirebase().catch(() => null);
  await k?.authMod.signOut(k.auth).catch(() => undefined);
  set({ status: "signed-out", user: null, lastSyncAt: null, problem: null });
}

/* ------------------------------------------------- shared explanation cache */

function cacheId(key: string): string {
  return key.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
}

/** Cloud copy of an AI explanation, if a signed-in learner (anyone) cached it before. */
export async function cloudExplanation(key: string, timeoutMs = 900): Promise<string | null> {
  if (!cloud.user) return null;
  try {
    const k = await loadFirebase();
    const snap = await Promise.race([
      k.fsMod.getDoc(k.fsMod.doc(k.db, "explanations", cacheId(key))),
      new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
    ]);
    const text = snap && snap.exists() ? (snap.data() as { text?: unknown }).text : null;
    return typeof text === "string" ? text : null;
  } catch {
    return null;
  }
}

export function saveCloudExplanation(key: string, text: string, lang: "en" | "ru"): void {
  if (!cloud.user || text.length > 600) return;
  void loadFirebase()
    .then((k) =>
      k.fsMod.setDoc(k.fsMod.doc(k.db, "explanations", cacheId(key)), {
        text,
        lang,
        createdAt: k.fsMod.serverTimestamp(),
      }),
    )
    .catch(() => undefined);
}
