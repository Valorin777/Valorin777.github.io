import { CategorySchema } from "@/lib/content/schema";
import type { Category, DiagnosticItem } from "@/lib/content/schema";
import type { CategoryScore, DiagnosticResult, LevelEstimate } from "@/types/state";

export interface DiagnosticPick {
  itemId: string;
  picked: number | null;
}

/** The learner's known weak spots first, then every other category in schema order. */
const WEAK_SPOTS: readonly Category[] = ["be-verb", "verb-patterns", "perfect", "collocations", "countable"];

export const DEFAULT_FOCUS: readonly Category[] = [
  ...WEAK_SPOTS,
  ...CategorySchema.options.filter((c) => !WEAK_SPOTS.includes(c)),
];

/** Position of a category in DEFAULT_FOCUS, used to break ties between equal scores. */
export function focusRank(c: Category): number {
  return DEFAULT_FOCUS.indexOf(c);
}

export function levelFor(ratio: number): LevelEstimate {
  if (ratio >= 0.9) return "B2";
  if (ratio >= 0.7) return "B1+";
  if (ratio >= 0.45) return "B1";
  return "B1-";
}

export const scoreRatio = (s: CategoryScore): number => (s.total === 0 ? 0 : s.correct / s.total);

export function scoreDiagnostic(
  items: readonly DiagnosticItem[],
  picks: Record<string, number | null>,
  nowIso: string,
): DiagnosticResult {
  if (items.length === 0) return skippedDiagnostic(nowIso);
  const byCategory: Partial<Record<Category, CategoryScore>> = {};
  let correct = 0;
  for (const item of items) {
    const ok = picks[item.id] === item.answer;
    const score = byCategory[item.category] ?? { correct: 0, total: 0 };
    byCategory[item.category] = { correct: score.correct + (ok ? 1 : 0), total: score.total + 1 };
    if (ok) correct++;
  }
  const present = Object.keys(byCategory) as Category[];
  const focus = present.sort(
    (a, b) => scoreRatio(byCategory[a] as CategoryScore) - scoreRatio(byCategory[b] as CategoryScore) || focusRank(a) - focusRank(b),
  );
  return { completedAt: nowIso, level: levelFor(correct / items.length), byCategory, focus };
}

export function skippedDiagnostic(nowIso: string): DiagnosticResult {
  return { completedAt: nowIso, level: null, byCategory: {}, focus: [...DEFAULT_FOCUS] };
}
