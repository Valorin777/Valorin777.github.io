import { useSyncExternalStore } from "react";
import type { Category, Phrase } from "@/lib/content/schema";
import { today } from "@/lib/date";
import {
  addPhraseCards,
  addSeconds,
  completeStep,
  initialState,
  migrate,
  recordAnswer,
  resetProgress,
  reviewCard,
  setOverride,
  setPosition,
  startDay,
  touchStreak,
  updateSettings,
} from "@/lib/progress";
import type { Grade } from "@/lib/srs";
import type { AppState, Settings } from "@/types/state";

/**
 * Local-first store. One versioned JSON document in localStorage, written on every change
 * (it is small), shared between tabs through the storage event. Phase 2 adds a Firestore
 * mirror behind the same actions, so components never change.
 */

import { STORAGE_KEY } from "@/lib/constants";
export { STORAGE_KEY };

const SERVER_STATE: AppState = initialState();
let state: AppState = SERVER_STATE;
let loaded = false;
let storageOk = true;
const listeners = new Set<() => void>();

function load() {
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    state = migrate(raw ? JSON.parse(raw) : null);
  } catch {
    storageOk = false;
    state = initialState();
  }
}

function persist() {
  if (!storageOk) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    storageOk = false;
  }
}

function emit() {
  listeners.forEach((l) => l());
}

export function getState(): AppState {
  if (!loaded && typeof window !== "undefined") load();
  return state;
}

function update(fn: (s: AppState) => AppState) {
  const next = fn(getState());
  if (next === state) return;
  state = next;
  persist();
  emit();
}

function onStorage(e: StorageEvent) {
  if (e.key !== STORAGE_KEY) return;
  try {
    state = migrate(e.newValue ? JSON.parse(e.newValue) : null);
    emit();
  } catch {
    // another tab wrote something unreadable: keep ours
  }
}

export function subscribe(listener: () => void): () => void {
  if (listeners.size === 0 && typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

/** The whole state. Stable reference between changes, server snapshot during hydration. */
export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, () => SERVER_STATE);
}

const noop = () => () => {};
/** False during the server render and hydration, true afterwards. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

export function storageAvailable(): boolean {
  getState();
  return storageOk;
}

const nowIso = () => new Date().toISOString();

export interface AnswerArgs {
  day: number;
  key: string;
  correct: boolean;
  category: Category;
  prompt: string;
  given: string;
  right: string;
  rule: string;
}

export const actions = {
  startDay(day: number) {
    update((s) => startDay(s, day, nowIso()));
  },
  completeStep(day: number, stepId: string, nextStepId: string | null) {
    update((s) => touchStreak(completeStep(s, day, stepId, nextStepId, nowIso()), today()));
  },
  setPosition(day: number, stepId: string) {
    update((s) => setPosition(s, day, stepId));
  },
  recordAnswer(a: AnswerArgs) {
    update((s) => touchStreak(recordAnswer(s, { ...a, nowIso: nowIso(), today: today() }), today()));
  },
  addPhraseCards(day: number, phrases: readonly Phrase[]) {
    update((s) => addPhraseCards(s, day, phrases, today(), nowIso()));
  },
  reviewCard(cardId: string, grade: Grade) {
    update((s) => touchStreak(reviewCard(s, cardId, grade, today(), nowIso()), today()));
  },
  addSeconds(day: number, seconds: number) {
    update((s) => addSeconds(s, day, seconds));
  },
  updateSettings(patch: Partial<Settings>) {
    update((s) => updateSettings(s, patch));
  },
  setOverride(day: number) {
    update((s) => setOverride(s, day));
  },
  reset() {
    update((s) => resetProgress(s));
  },
};
