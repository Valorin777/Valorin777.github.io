import type { Exercise, TenseRef } from "@/lib/content/schema";
import { getDayProgress } from "@/lib/progress";
import type { AppState } from "@/types/state";

/**
 * Tense-reference answers live with the other non-lesson answers (day 0, like the coach), under
 * keys that cannot clash with lesson exercise ids.
 */
export const TENSE_DAY = 0;

export function tenseExerciseKey(tenseId: string, exerciseId: string): string {
  return `tense-${tenseId}-${exerciseId}`;
}

/** The exercise as the player records it: same content, a reference-wide unique id. */
export function tenseExercise(t: TenseRef, ex: Exercise): Exercise {
  return { ...ex, id: tenseExerciseKey(t.id, ex.id) };
}

/** How many of the entry's exercises have been answered right at least once. */
export function tenseProgress(s: AppState, t: TenseRef): { right: number; total: number } {
  const answers = getDayProgress(s, TENSE_DAY).answers;
  const right = t.exercises.filter((ex) => answers[tenseExerciseKey(t.id, ex.id)]?.correct).length;
  return { right, total: t.exercises.length };
}
