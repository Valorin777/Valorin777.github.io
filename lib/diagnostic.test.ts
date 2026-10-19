import { describe, expect, it } from "vitest";
import { CategorySchema } from "@/lib/content/schema";
import type { Category, DiagnosticItem } from "@/lib/content/schema";
import { DEFAULT_FOCUS, focusRank, levelFor, scoreDiagnostic, skippedDiagnostic } from "@/lib/diagnostic";

const NOW = "2026-10-19T09:00:00.000Z";

function item(id: string, category: Category, answer = 0): DiagnosticItem {
  return { id, prompt: "I ___ it.", options: ["a", "b", "c"], answer, category };
}

/** n items of one category; picks right for the first `right` of them. */
function block(prefix: string, category: Category, n: number, right: number) {
  const items = Array.from({ length: n }, (_, i) => item(`${prefix}-${i}`, category));
  const picks: Record<string, number | null> = {};
  items.forEach((it, i) => (picks[it.id] = i < right ? 0 : 1));
  return { items, picks };
}

function run(blocks: ReturnType<typeof block>[]) {
  return scoreDiagnostic(
    blocks.flatMap((b) => b.items),
    Object.assign({}, ...blocks.map((b) => b.picks)) as Record<string, number | null>,
    NOW,
  );
}

describe("levelFor", () => {
  it("uses the documented thresholds", () => {
    expect(levelFor(1)).toBe("B2");
    expect(levelFor(0.9)).toBe("B2");
    expect(levelFor(0.89)).toBe("B1+");
    expect(levelFor(0.7)).toBe("B1+");
    expect(levelFor(0.69)).toBe("B1");
    expect(levelFor(0.45)).toBe("B1");
    expect(levelFor(0.44)).toBe("B1-");
    expect(levelFor(0)).toBe("B1-");
  });
});

describe("scoreDiagnostic", () => {
  it("levels by the overall ratio", () => {
    expect(run([block("a", "be-verb", 10, 9)]).level).toBe("B2");
    expect(run([block("a", "be-verb", 10, 8)]).level).toBe("B1+");
    expect(run([block("a", "be-verb", 10, 7)]).level).toBe("B1+");
    expect(run([block("a", "be-verb", 10, 6)]).level).toBe("B1");
    expect(run([block("a", "be-verb", 20, 9)]).level).toBe("B1");
    expect(run([block("a", "be-verb", 10, 4)]).level).toBe("B1-");
  });

  it("counts by category and stamps the time", () => {
    const r = run([block("a", "be-verb", 3, 1), block("b", "countable", 2, 2)]);
    expect(r.completedAt).toBe(NOW);
    expect(r.byCategory).toEqual({ "be-verb": { correct: 1, total: 3 }, countable: { correct: 2, total: 2 } });
    expect(r.level).toBe("B1");
  });

  it("treats null and missing picks as wrong", () => {
    const items = [item("a", "perfect", 2), item("b", "perfect", 1), item("c", "perfect", 0)];
    const r = scoreDiagnostic(items, { a: 2, b: null }, NOW);
    expect(r.byCategory.perfect).toEqual({ correct: 1, total: 3 });
  });

  it("puts the weakest category first", () => {
    const r = run([
      block("a", "articles", 2, 2),
      block("b", "perfect", 4, 1),
      block("c", "be-verb", 2, 1),
      block("d", "modals", 2, 0),
    ]);
    expect(r.focus).toEqual(["modals", "perfect", "be-verb", "articles"]);
  });

  it("breaks ties by the weak-spot order, then the rest", () => {
    const r = run([
      block("a", "modals", 1, 0),
      block("b", "countable", 1, 0),
      block("c", "collocations", 1, 0),
      block("d", "perfect", 1, 0),
      block("e", "verb-patterns", 1, 0),
      block("f", "be-verb", 1, 0),
      block("g", "articles", 1, 0),
    ]);
    expect(r.focus).toEqual(["be-verb", "verb-patterns", "perfect", "collocations", "countable", "modals", "articles"]);
  });

  it("only lists categories present in the items", () => {
    const r = run([block("a", "linking", 2, 1)]);
    expect(r.focus).toEqual(["linking"]);
  });

  it("treats an empty item list as skipped", () => {
    expect(scoreDiagnostic([], {}, NOW)).toEqual(skippedDiagnostic(NOW));
  });
});

describe("skippedDiagnostic", () => {
  it("has no level and the default focus order", () => {
    const r = skippedDiagnostic(NOW);
    expect(r).toEqual({ completedAt: NOW, level: null, byCategory: {}, focus: [...DEFAULT_FOCUS] });
    expect(r.focus.slice(0, 5)).toEqual(["be-verb", "verb-patterns", "perfect", "collocations", "countable"]);
    expect([...r.focus].sort()).toEqual([...CategorySchema.options].sort());
    r.focus.push("modals");
    expect(DEFAULT_FOCUS).toHaveLength(CategorySchema.options.length);
  });

  it("ranks every category", () => {
    for (const c of CategorySchema.options) expect(focusRank(c)).toBeGreaterThanOrEqual(0);
    expect(focusRank("be-verb")).toBe(0);
  });
});
