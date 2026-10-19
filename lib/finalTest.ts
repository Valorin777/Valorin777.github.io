import { normalize } from "@/lib/answers";
import type { Category, FinalDay, OpenGap } from "@/lib/content/schema";
import { focusRank, scoreRatio } from "@/lib/diagnostic";
import type { CategoryScore, FinalTestResult } from "@/types/state";

export type FinalBand = FinalTestResult["band"];

export const FINAL_BANDS: readonly FinalBand[] = ["B2 ready", "Nearly B2", "Strong B1", "B1"];

export function gapKey(textId: string, n: number): string {
  return `${textId}:${n}`;
}

/** Normalized single word, or "" when the input is empty or more than one word. */
function oneWord(input: string): string {
  // normalize() already strips edge punctuation and quotes; this also drops brackets, dashes, digits.
  const word = normalize(input).replace(/^[^a-z']+|[^a-z']+$/g, "");
  return /\s/.test(word) ? "" : word;
}

/** Open cloze: exactly one word, any accepted answer, case and surrounding punctuation ignored. */
export function checkOpenGap(input: string, gap: OpenGap): boolean {
  const word = oneWord(input);
  if (word === "") return false;
  return gap.answers.some((a) => normalize(a) === word);
}

export interface FinalItem {
  key: string;
  part: 1 | 2;
  textId: string;
  /** Gap number in its text, starting at 1. */
  n: number;
  category: Category;
}

/** Every gap of the test in reading order: Part 1 texts, then Part 2 texts. */
export function finalItems(day: FinalDay): FinalItem[] {
  const items: FinalItem[] = [];
  for (const text of day.part1) {
    text.gaps.forEach((gap, i) => {
      items.push({ key: gapKey(text.id, i + 1), part: 1, textId: text.id, n: i + 1, category: gap.category });
    });
  }
  for (const text of day.part2) {
    text.gaps.forEach((gap, i) => {
      items.push({ key: gapKey(text.id, i + 1), part: 2, textId: text.id, n: i + 1, category: gap.category });
    });
  }
  return items;
}

export function bandFor(percent: number): FinalBand {
  if (percent >= 75) return "B2 ready";
  if (percent >= 60) return "Nearly B2";
  if (percent >= 45) return "Strong B1";
  return "B1";
}

const add = (s: CategoryScore, ok: boolean): CategoryScore => ({ correct: s.correct + (ok ? 1 : 0), total: s.total + 1 });

/**
 * Part 1 answers are option indices, Part 2 answers typed words. Anything missing or of the
 * wrong type counts as wrong with given "". Part 1 `given` is the picked option's text.
 */
export function scoreFinalTest(
  day: FinalDay,
  answers: Record<string, string | number | null>,
  nowIso: string,
): FinalTestResult {
  const result: FinalTestResult["answers"] = {};
  const byCategory: Partial<Record<Category, CategoryScore>> = {};
  let part1: CategoryScore = { correct: 0, total: 0 };
  let part2: CategoryScore = { correct: 0, total: 0 };
  const score = (key: string, category: Category, given: string, correct: boolean) => {
    result[key] = { given, correct };
    byCategory[category] = add(byCategory[category] ?? { correct: 0, total: 0 }, correct);
  };

  for (const text of day.part1) {
    text.gaps.forEach((gap, i) => {
      const key = gapKey(text.id, i + 1);
      const picked = Object.prototype.hasOwnProperty.call(answers, key) ? answers[key] : null;
      const given = typeof picked === "number" ? (gap.options[picked] ?? "") : "";
      const correct = picked === gap.answer;
      score(key, gap.category, given, correct);
      part1 = add(part1, correct);
    });
  }
  for (const text of day.part2) {
    text.gaps.forEach((gap, i) => {
      const key = gapKey(text.id, i + 1);
      const typed = Object.prototype.hasOwnProperty.call(answers, key) ? answers[key] : null;
      const given = typeof typed === "string" ? typed.trim() : "";
      const correct = checkOpenGap(given, gap);
      score(key, gap.category, given, correct);
      part2 = add(part2, correct);
    });
  }

  const total = part1.total + part2.total;
  const percent = total === 0 ? 0 : Math.round((100 * (part1.correct + part2.correct)) / total);
  return { completedAt: nowIso, answers: result, part1, part2, byCategory, percent, band: bandFor(percent) };
}

/**
 * Categories to work on next: lowest ratio first, only those with at least two gaps and at
 * least one mistake. Ties: more mistakes first, then the learner's known weak spots first.
 */
export function weakestCategories(r: FinalTestResult, limit = 3): Category[] {
  const scored = (Object.entries(r.byCategory) as [Category, CategoryScore | undefined][]).filter(
    (e): e is [Category, CategoryScore] => e[1] !== undefined && e[1].total >= 2 && e[1].correct < e[1].total,
  );
  return scored
    .sort(
      ([ca, a], [cb, b]) =>
        scoreRatio(a) - scoreRatio(b) || b.total - b.correct - (a.total - a.correct) || focusRank(ca) - focusRank(cb),
    )
    .slice(0, Math.max(0, Math.floor(limit)))
    .map(([c]) => c);
}
