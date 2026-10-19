import type { Category } from "@/lib/content/schema";

/**
 * Everything the app remembers about the learner. Phase 1 stores it on the device
 * (lib/store.ts); Phase 2 mirrors the same shapes into Firestore under users/{uid}.
 * All dates are local calendar days "YYYY-MM-DD" unless the name ends in "At" (ISO time).
 */

export type ThemePref = "system" | "light" | "dark";

export interface Settings {
  theme: ThemePref;
  /** SpeechSynthesisVoice.voiceURI the learner picked; null = best available English voice. */
  voiceURI: string | null;
  /** Speech rate for TTS, 0.6–1.2. */
  rate: number;
  /** Soft answer sounds. Off by default. */
  sound: boolean;
  /** Short vibration on answers where the device supports it. */
  haptics: boolean;
  /** Show Russian translations of examples without asking. */
  showRu: boolean;
}

/** SM-2 scheduling state. */
export interface SrsState {
  /** Easiness factor, >= 1.3, starts at 2.5. */
  ef: number;
  /** Current interval in days (0 = new / relearning). */
  interval: number;
  /** Successful reviews in a row. */
  reps: number;
  /** Calendar day the card is due. */
  due: string;
  /** Times the card was forgotten after being learned. */
  lapses: number;
}

export type CardSource = "mistake" | "phrase";

export interface Card extends SrsState {
  /** Stable id: "m:<exerciseId>" for mistakes, "p:<hash of phrase>" for phrases. */
  id: string;
  /** Prompt side. For mistakes: the exercise sentence with the gap or the wrong sentence. */
  front: string;
  /** Answer side: the correct form or the English phrase. */
  back: string;
  /** Optional one-line rule shown under the answer. */
  note?: string;
  category: Category;
  source: CardSource;
  /** Day number the card came from. */
  day: number;
  createdAt: string;
  lastReviewedAt?: string;
}

/** One entry per (exercise) the learner got wrong at least once. */
export interface ErrorEntry {
  /** Key = exercise id or speak item id. */
  key: string;
  category: Category;
  day: number;
  /** What was asked, readable on its own (e.g. sentence with a gap). */
  prompt: string;
  /** The learner's last wrong answer. */
  wrong: string;
  /** The correct answer. */
  right: string;
  rule: string;
  count: number;
  firstAt: string;
  lastAt: string;
}

export interface AnswerRecord {
  correct: boolean;
  /** Attempts until correct (1 = first try). */
  attempts: number;
  /** Correct on the first try — the number mastery is computed from. */
  firstTry: boolean;
}

export interface DayProgress {
  startedAt?: string;
  completedAt?: string;
  /** Step ids the learner has finished (see lib/steps.ts). */
  doneSteps: string[];
  /** Exercise and speak item results by id. */
  answers: Record<string, AnswerRecord>;
  /** Opened before the previous day was finished. */
  override?: boolean;
  /** Seconds spent in this day, for the "about N min left" estimate. */
  seconds: number;
}

export interface Position {
  day: number;
  stepId: string;
}

export interface Streak {
  current: number;
  best: number;
  /** Last calendar day with any learning activity. */
  lastDay: string | null;
}

export interface AppState {
  version: 1;
  settings: Settings;
  position: Position | null;
  days: Record<number, DayProgress>;
  cards: Record<string, Card>;
  errors: Record<string, ErrorEntry>;
  streak: Streak;
}
