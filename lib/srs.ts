import { addDays } from "@/lib/date";
import type { SrsState } from "@/types/state";

/** SM-2 recall grade: 0–2 forgotten, 3 hard, 4 good, 5 easy. */
export type Grade = 0 | 1 | 2 | 3 | 4 | 5;

export const MIN_EF = 1.3;

export const GRADES: readonly { grade: Grade; label: string; key: string }[] = [
  { grade: 1, label: "Again", key: "1" },
  { grade: 3, label: "Hard", key: "2" },
  { grade: 4, label: "Good", key: "3" },
  { grade: 5, label: "Easy", key: "4" },
];

export function newSrs(today: string): SrsState {
  return { ef: 2.5, interval: 0, reps: 0, due: today, lapses: 0 };
}

function nextEf(ef: number, grade: Grade): number {
  const q = 5 - grade;
  const next = ef + (0.1 - q * (0.08 + q * 0.02));
  // Rounded so repeated reviews do not accumulate float noise (2.6000000000000005).
  return Math.max(MIN_EF, Math.round(next * 1000) / 1000);
}

/** Interval in days the grade would give; uses the current ef, as classic SM-2 does. */
export function previewInterval(s: SrsState, grade: Grade): number {
  if (grade < 3) return 1;
  if (s.reps <= 0) return 1;
  if (s.reps === 1) return 6;
  return Math.max(1, Math.round(s.interval * s.ef));
}

/** Classic SM-2 step. Keeps every other field of `s` (so a Card stays a Card). */
export function review<T extends SrsState>(s: T, grade: Grade, today: string): T {
  const interval = previewInterval(s, grade);
  const passed = grade >= 3;
  return {
    ...s,
    ef: nextEf(s.ef, grade),
    interval,
    reps: passed ? s.reps + 1 : 0,
    lapses: !passed && s.reps > 0 ? s.lapses + 1 : s.lapses,
    due: addDays(today, interval),
  };
}

export function isDue(s: SrsState, today: string): boolean {
  return s.due <= today;
}

/** Due cards only: the longest overdue first, then the hardest (lowest ef) first. */
export function dueSorted<T extends SrsState>(cards: readonly T[], today: string): T[] {
  return cards
    .filter((c) => isDue(c, today))
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.ef - b.ef));
}

export function formatInterval(days: number): string {
  if (!Number.isFinite(days) || days <= 0) return "today";
  const d = Math.max(1, Math.round(days));
  if (d === 1) return "1 day";
  if (d < 14) return `${d} days`;
  if (d < 56) return `${Math.round(d / 7)} wk`;
  if (d < 365) return `${Math.round(d / 30)} mo`;
  const years = Math.round((d / 365) * 10) / 10;
  return `${years} yr`;
}
