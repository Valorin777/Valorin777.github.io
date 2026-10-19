import { useSyncExternalStore } from "react";
import { loadFirebase, type FirebaseKit } from "@/lib/firebase";
import { mergeStates } from "@/lib/sync";
import { getState, replaceState, subscribe as subscribeStore } from "@/lib/store";
import type { AppState } from "@/types/state";

/**
 * Cloud sync for signed-in learners. The device copy stays the source of truth for the UI;
 * the cloud copy lives in three documents under users/{uid}/data/{core|cards|errors} and is
 * merged both ways with mergeStates (union of progress, latest settings), so nothing is lost
 * when two devices were used offline.
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

function split(s: AppState): Record<Part, Record<string, unknown>> {
  const { cards, errors, ...core } = s;
  // JSON round trip drops undefined, which Firestore rejects.
  const clean = <T>(v: T) => JSON.parse(JSON.stringify(v)) as Record<string, unknown>;
  return { core: clean(core), cards: clean({ cards }), errors: clean({ errors }) };
}

function join(parts: Partial<Record<Part, Record<string, unknown>>>): AppState | null {
  if (!parts.core) return null;
  return {
    ...(parts.core as unknown as Omit<AppState, "cards" | "errors">),
    cards: ((parts.cards?.cards as AppState["cards"] | undefined) ?? {}),
    errors: ((parts.errors?.errors as AppState["errors"] | undefined) ?? {}),
  } as AppState;
}

let stopSync: (() => void) | null = null;

function errorMessage(e: unknown): string {
  const code = typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : "";
  if (code.includes("popup-closed") || code.includes("cancelled-popup")) return "";
  if (code.includes("operation-not-allowed") || code.includes("configuration-not-found")) {
    return "Google sign-in is not switched on for this app yet.";
  }
  if (code.includes("unauthorized-domain")) return "This address is not allowed to sign in yet.";
  if (code.includes("network")) return "No connection. Your progress is safe on this device.";
  return "Sign-in did not work. Please try again.";
}

async function startSync(k: FirebaseKit, uid: string) {
  stopSync?.();
  const { doc, getDoc, setDoc, onSnapshot } = k.fsMod;
  const ref = (p: Part) => doc(k.db, "users", uid, "data", p);
  const remote: Partial<Record<Part, Record<string, unknown>>> = {};
  const lastWritten: Partial<Record<Part, string>> = {};
  set({ status: "syncing", problem: null });

  const writeAll = async (s: AppState) => {
    const parts = split(s);
    await Promise.all(
      PARTS.map(async (p) => {
        const json = JSON.stringify(parts[p]);
        if (lastWritten[p] === json) return;
        lastWritten[p] = json;
        await setDoc(ref(p), parts[p]);
      }),
    );
    set({ status: "synced", lastSyncAt: new Date().toISOString(), problem: null });
  };

  try {
    const snaps = await Promise.all(PARTS.map((p) => getDoc(ref(p))));
    snaps.forEach((snap, i) => {
      if (snap.exists()) {
        remote[PARTS[i]] = snap.data() as Record<string, unknown>;
        lastWritten[PARTS[i]] = JSON.stringify(remote[PARTS[i]]);
      }
    });
    const fromCloud = join(remote);
    const merged = fromCloud ? mergeStates(getState(), fromCloud) : getState();
    if (merged !== getState()) replaceState(merged);
    await writeAll(merged);
  } catch (e) {
    set({ status: navigator.onLine ? "error" : "offline", problem: errorMessage(e) || null });
  }

  // Remote → local: changes from other devices.
  const unsubs = PARTS.map((p) =>
    onSnapshot(ref(p), (snap) => {
      if (snap.metadata.hasPendingWrites || !snap.exists()) return;
      remote[p] = snap.data() as Record<string, unknown>;
      lastWritten[p] = JSON.stringify(remote[p]);
      const fromCloud = join(remote);
      if (!fromCloud) return;
      const merged = mergeStates(getState(), fromCloud);
      if (JSON.stringify(merged) !== JSON.stringify(getState())) replaceState(merged);
      set({ status: "synced", lastSyncAt: new Date().toISOString() });
    }),
  );

  // Local → remote: debounced.
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsubStore = subscribeStore(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      writeAll(getState()).catch((e: unknown) =>
        set({ status: navigator.onLine ? "error" : "offline", problem: errorMessage(e) || null }),
      );
    }, WRITE_DELAY_MS);
  });

  const onOnline = () => writeAll(getState()).catch(() => undefined);
  window.addEventListener("online", onOnline);

  stopSync = () => {
    unsubs.forEach((u) => u());
    unsubStore();
    window.removeEventListener("online", onOnline);
    if (timer) clearTimeout(timer);
    stopSync = null;
  };
}

function toUser(u: { uid: string; displayName: string | null; email: string | null; photoURL: string | null }): CloudUser {
  return { uid: u.uid, name: u.displayName, email: u.email, photo: u.photoURL };
}

let started = false;

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
    if (!started) {
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
