import { describe, expect, it } from "vitest";
import type { Category, ChoiceGap, FinalDay, OpenGap } from "@/lib/content/schema";
import { bandFor, checkOpenGap, finalItems, gapKey, scoreFinalTest, weakestCategories } from "@/lib/finalTest";
import type { FinalTestResult } from "@/types/state";

const NOW = "2026-10-25T10:00:00.000Z";

const choice = (answer: number, category: Category): ChoiceGap => ({
  options: ["in spite", "despite", "although", "even"],
  answer,
  category,
  explain: "x",
});
const open = (answers: string[], category: Category): OpenGap => ({ answers, category, explain: "x" });

const DAY: FinalDay = {
  number: 7,
  title: "Test",
  subtitle: "s",
  goal: "g",
  intro: "i",
  part1: [
    { id: "p1-a", title: "A", text: "{{1}} {{2}}", gaps: [choice(1, "linking"), choice(2, "linking")] },
    { id: "p1-b", title: "B", text: "{{1}}", gaps: [choice(0, "collocations")] },
  ],
  part2: [
    { id: "p2-a", title: "C", text: "{{1}} {{2}}", gaps: [open(["although", "though"], "linking"), open(["has"], "perfect")] },
    { id: "p2-b", title: "D", text: "{{1}}", gaps: [open(["it's"], "be-verb")] },
  ],
  speak: [],
};

describe("gapKey and finalItems", () => {
  it("builds <textId>:<n> keys", () => {
    expect(gapKey("p1-a", 3)).toBe("p1-a:3");
  });

  it("lists every gap in reading order, part 1 first", () => {
    expect(finalItems(DAY)).toEqual([
      { key: "p1-a:1", part: 1, textId: "p1-a", n: 1, category: "linking" },
      { key: "p1-a:2", part: 1, textId: "p1-a", n: 2, category: "linking" },
      { key: "p1-b:1", part: 1, textId: "p1-b", n: 1, category: "collocations" },
      { key: "p2-a:1", part: 2, textId: "p2-a", n: 1, category: "linking" },
      { key: "p2-a:2", part: 2, textId: "p2-a", n: 2, category: "perfect" },
      { key: "p2-b:1", part: 2, textId: "p2-b", n: 1, category: "be-verb" },
    ]);
  });
});

describe("checkOpenGap", () => {
  const gap = open(["although", "though"], "linking");

  it("ignores case, spaces and surrounding punctuation", () => {
    expect(checkOpenGap("although", gap)).toBe(true);
    expect(checkOpenGap("Although", gap)).toBe(true);
    expect(checkOpenGap("  ALTHOUGH  ", gap)).toBe(true);
    expect(checkOpenGap("though.", gap)).toBe(true);
    expect(checkOpenGap("\"though\"", gap)).toBe(true);
    expect(checkOpenGap("«though»", gap)).toBe(true);
    expect(checkOpenGap("‘though’", gap)).toBe(true);
    expect(checkOpenGap("(though),", gap)).toBe(true);
  });

  it("rejects more than one word, empty input and wrong words", () => {
    expect(checkOpenGap("even though", gap)).toBe(false);
    expect(checkOpenGap("though though", gap)).toBe(false);
    expect(checkOpenGap("", gap)).toBe(false);
    expect(checkOpenGap("  .  ", gap)).toBe(false);
    expect(checkOpenGap("despite", gap)).toBe(false);
    expect(checkOpenGap("althoug", gap)).toBe(false);
  });

  it("normalizes curly apostrophes and keeps apostrophes meaningful", () => {
    const g = open(["it's"], "be-verb");
    expect(checkOpenGap("it’s", g)).toBe(true);
    expect(checkOpenGap("It's", g)).toBe(true);
    expect(checkOpenGap("its", g)).toBe(false);
    expect(checkOpenGap("it is", g)).toBe(false);
  });

  it("matches accepted answers case-insensitively", () => {
    expect(checkOpenGap("which", open(["Which"], "linking"))).toBe(true);
  });
});

describe("bandFor", () => {
  it("uses the documented thresholds", () => {
    expect(bandFor(100)).toBe("B2 ready");
    expect(bandFor(75)).toBe("B2 ready");
    expect(bandFor(74)).toBe("Nearly B2");
    expect(bandFor(60)).toBe("Nearly B2");
    expect(bandFor(59)).toBe("Strong B1");
    expect(bandFor(45)).toBe("Strong B1");
    expect(bandFor(44)).toBe("B1");
    expect(bandFor(0)).toBe("B1");
  });
});

describe("scoreFinalTest", () => {
  it("scores everything right as 100 and B2 ready", () => {
    const r = scoreFinalTest(
      DAY,
      { "p1-a:1": 1, "p1-a:2": 2, "p1-b:1": 0, "p2-a:1": "Though.", "p2-a:2": "has", "p2-b:1": "it’s" },
      NOW,
    );
    expect(r.completedAt).toBe(NOW);
    expect(r.percent).toBe(100);
    expect(r.band).toBe("B2 ready");
    expect(r.part1).toEqual({ correct: 3, total: 3 });
    expect(r.part2).toEqual({ correct: 3, total: 3 });
    expect(r.answers["p1-a:1"]).toEqual({ given: "despite", correct: true });
    expect(r.answers["p2-a:1"]).toEqual({ given: "Though.", correct: true });
  });

  it("counts unanswered and wrongly typed answers as wrong with given ''", () => {
    const r = scoreFinalTest(DAY, { "p1-a:1": "1", "p1-a:2": null, "p2-a:1": 3, "p2-a:2": "  have " }, NOW);
    expect(Object.keys(r.answers)).toHaveLength(6);
    expect(r.answers["p1-a:1"]).toEqual({ given: "", correct: false });
    expect(r.answers["p1-a:2"]).toEqual({ given: "", correct: false });
    expect(r.answers["p1-b:1"]).toEqual({ given: "", correct: false });
    expect(r.answers["p2-a:1"]).toEqual({ given: "", correct: false });
    expect(r.answers["p2-a:2"]).toEqual({ given: "have", correct: false });
    expect(r.answers["p2-b:1"]).toEqual({ given: "", correct: false });
    expect(r.percent).toBe(0);
    expect(r.band).toBe("B1");
  });

  it("ignores an out-of-range option index", () => {
    const r = scoreFinalTest(DAY, { "p1-a:1": 9, "p1-a:2": -1 }, NOW);
    expect(r.answers["p1-a:1"]).toEqual({ given: "", correct: false });
    expect(r.answers["p1-a:2"]).toEqual({ given: "", correct: false });
  });

  it("rounds the percent and fills per-part and per-category scores", () => {
    // 4 of 6 right = 66.67 → 67
    const r = scoreFinalTest(
      DAY,
      { "p1-a:1": 1, "p1-a:2": 0, "p1-b:1": 0, "p2-a:1": "although", "p2-a:2": "had", "p2-b:1": "it's" },
      NOW,
    );
    expect(r.percent).toBe(67);
    expect(r.band).toBe("Nearly B2");
    expect(r.part1).toEqual({ correct: 2, total: 3 });
    expect(r.part2).toEqual({ correct: 2, total: 3 });
    expect(r.byCategory).toEqual({
      linking: { correct: 2, total: 3 },
      collocations: { correct: 1, total: 1 },
      perfect: { correct: 0, total: 1 },
      "be-verb": { correct: 1, total: 1 },
    });
    expect(r.answers["p1-a:2"]).toEqual({ given: "in spite", correct: false });
  });

  it("gives 0 and B1 for a test with no gaps", () => {
    const r = scoreFinalTest({ ...DAY, part1: [], part2: [] }, {}, NOW);
    expect(r.percent).toBe(0);
    expect(r.band).toBe("B1");
  });
});

describe("weakestCategories", () => {
  const result = (byCategory: FinalTestResult["byCategory"]): FinalTestResult => ({
    completedAt: NOW,
    answers: {},
    part1: { correct: 0, total: 0 },
    part2: { correct: 0, total: 0 },
    byCategory,
    percent: 0,
    band: "B1",
  });

  it("lists the lowest ratios first, needs two gaps and skips perfect scores", () => {
    const r = result({
      linking: { correct: 1, total: 4 },
      perfect: { correct: 0, total: 1 },
      modals: { correct: 2, total: 3 },
      articles: { correct: 2, total: 2 },
      collocations: { correct: 1, total: 2 },
      countable: { correct: 2, total: 5 },
    });
    expect(weakestCategories(r)).toEqual(["linking", "countable", "collocations"]);
    expect(weakestCategories(r, 10)).toEqual(["linking", "countable", "collocations", "modals"]);
    expect(weakestCategories(r, 1)).toEqual(["linking"]);
    expect(weakestCategories(r, 0)).toEqual([]);
  });

  it("breaks ties by more mistakes, then the weak-spot order", () => {
    const r = result({
      modals: { correct: 1, total: 2 },
      perfect: { correct: 2, total: 4 },
      "be-verb": { correct: 1, total: 2 },
    });
    expect(weakestCategories(r)).toEqual(["perfect", "be-verb", "modals"]);
  });

  it("works on a real scored test", () => {
    const r = scoreFinalTest(DAY, { "p1-a:1": 1 }, NOW);
    expect(weakestCategories(r)).toEqual(["linking"]);
  });
});
