import type { Category, Day, Exercise } from "@/lib/content/schema";
import { mistakeCardId } from "@/lib/progress";
import { dueSorted } from "@/lib/srs";
import type { AppState, ErrorEntry } from "@/types/state";

/**
 * "Fix my mistakes" drill: the learner's most frequent errors first (the original exercise
 * again when it still exists in the content, otherwise its flashcard), then due mistake cards.
 * Exercise item keys are exercise ids, card item keys are card ids ("m:…"), so they never clash.
 */
export type DrillItem =
  | { kind: "exercise"; key: string; day: number; topicId: string; exercise: Exercise }
  | { kind: "card"; key: string; cardId: string };

export const DRILL_LIMIT = 10;

interface ExerciseRef {
  day: number;
  topicId: string;
  exercise: Exercise;
}

function exerciseIndex(days: readonly Day[]): Map<string, ExerciseRef> {
  const index = new Map<string, ExerciseRef>();
  for (const day of days) {
    for (const topic of day.topics) {
      for (const exercise of topic.exercises) {
        if (!index.has(exercise.id)) index.set(exercise.id, { day: day.number, topicId: topic.id, exercise });
      }
    }
  }
  return index;
}

/** Errors by count (desc), then diagnostic focus rank, then most recent, then key. */
function sortedErrors(s: AppState): ErrorEntry[] {
  const focus = s.diagnostic?.focus ?? [];
  const rank = (c: Category): number => {
    const i = focus.indexOf(c);
    return i === -1 ? focus.length : i;
  };
  return Object.values(s.errors).sort(
    (a, b) =>
      b.count - a.count ||
      rank(a.category) - rank(b.category) ||
      (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0) ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
}

export function buildDrill(s: AppState, days: readonly Day[], today: string, limit = DRILL_LIMIT): DrillItem[] {
  const max = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : DRILL_LIMIT;
  const items: DrillItem[] = [];
  // Card ids already covered, by a card item or by the exercise the card was made from.
  const usedCards = new Set<string>();
  const index = exerciseIndex(days);

  for (const error of sortedErrors(s)) {
    if (items.length >= max) return items;
    const cardId = mistakeCardId(error.key);
    if (usedCards.has(cardId)) continue;
    const ref = index.get(error.key);
    if (ref) {
      items.push({ kind: "exercise", key: error.key, day: ref.day, topicId: ref.topicId, exercise: ref.exercise });
      usedCards.add(cardId);
    } else if (s.cards[cardId]) {
      items.push({ kind: "card", key: cardId, cardId });
      usedCards.add(cardId);
    }
  }

  const mistakes = Object.values(s.cards).filter((c) => c.source === "mistake" && !usedCards.has(c.id));
  for (const card of dueSorted(mistakes, today)) {
    if (items.length >= max) break;
    items.push({ kind: "card", key: card.id, cardId: card.id });
    usedCards.add(card.id);
  }
  return items;
}

export function drillSize(s: AppState, days: readonly Day[], today: string): number {
  return buildDrill(s, days, today).length;
}
