import { describe, expect, it } from "vitest";
import type { Category, Day, Exercise, Topic } from "@/lib/content/schema";
import { buildDrill, DRILL_LIMIT, drillSize } from "@/lib/drill";
import { addPhraseCards, initialState, recordAnswer, reviewCard, setDiagnostic } from "@/lib/progress";
import type { AnswerInput } from "@/lib/progress";
import type { AppState } from "@/types/state";

const D0 = "2026-10-19";
const D1 = "2026-10-20";
const at = (mm: number) => `2026-10-19T09:${String(mm).padStart(2, "0")}:00.000Z`;

const ex = (id: string): Exercise => ({
  id,
  type: "choice",
  prompt: "I ___ it.",
  options: ["do", "did"],
  answer: 1,
  rule: "r",
  explain: "e",
});

const topic = (id: string, category: Category, exIds: string[]): Topic =>
  ({ id, category, exercises: exIds.map(ex) }) as unknown as Topic;

const DAYS: Day[] = [
  { number: 1, topics: [topic("be", "be-verb", ["be-1", "be-2"]), topic("pp", "perfect", ["pp-1"])] } as unknown as Day,
  { number: 2, topics: [topic("vp", "verb-patterns", ["vp-1", "be-1"])] } as unknown as Day,
];

function wrong(key: string, category: Category, minute: number, day = 1): (s: AppState) => AppState {
  const a: AnswerInput = {
    day,
    key,
    correct: false,
    category,
    prompt: `prompt ${key}`,
    given: "x",
    right: "y",
    rule: "",
    nowIso: at(minute),
    today: D0,
  };
  return (s) => recordAnswer(s, a);
}

function build(...steps: ((s: AppState) => AppState)[]): AppState {
  return steps.reduce((s, f) => f(s), initialState());
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

const keys = (s: AppState, limit?: number, today = D0) => buildDrill(s, DAYS, today, limit).map((i) => i.key);

describe("buildDrill", () => {
  it("is empty without mistakes", () => {
    expect(buildDrill(initialState(), DAYS, D0)).toEqual([]);
    expect(drillSize(initialState(), DAYS, D0)).toBe(0);
  });

  it("turns errors on known exercises into exercise items", () => {
    const s = build(wrong("pp-1", "perfect", 1));
    expect(buildDrill(s, DAYS, D0)).toEqual([{ kind: "exercise", key: "pp-1", day: 1, topicId: "pp", exercise: ex("pp-1") }]);
  });

  it("uses the first day that has the exercise", () => {
    const s = build(wrong("be-1", "be-verb", 1), wrong("vp-1", "verb-patterns", 2, 2));
    const items = buildDrill(s, DAYS, D0);
    expect(items[0]).toMatchObject({ kind: "exercise", key: "vp-1", day: 2, topicId: "vp" });
    expect(items[1]).toMatchObject({ kind: "exercise", key: "be-1", day: 1, topicId: "be" });
  });

  it("falls back to the mistake card when the exercise is not in the content", () => {
    const s = build(wrong("speak-3", "collocations", 1));
    expect(buildDrill(s, DAYS, D0)).toEqual([{ kind: "card", key: "m:speak-3", cardId: "m:speak-3" }]);
  });

  it("skips an error with neither an exercise nor a card", () => {
    const s = build(wrong("gone", "modals", 1));
    expect(buildDrill({ ...s, cards: without(s.cards, "m:gone") }, DAYS, D0)).toEqual([]);
  });

  it("orders by count, then most recent", () => {
    const s = build(
      wrong("be-1", "be-verb", 1),
      wrong("pp-1", "perfect", 2),
      wrong("be-2", "be-verb", 3),
      wrong("be-2", "be-verb", 4),
    );
    expect(keys(s)).toEqual(["be-2", "pp-1", "be-1"]);
  });

  it("puts diagnostic focus categories first within equal counts", () => {
    const s0 = build(wrong("be-1", "be-verb", 1), wrong("pp-1", "perfect", 2), wrong("vp-1", "verb-patterns", 3, 2));
    expect(keys(s0)).toEqual(["vp-1", "pp-1", "be-1"]);
    const s1 = setDiagnostic(s0, { completedAt: at(0), level: "B1", byCategory: {}, focus: ["be-verb", "perfect"] });
    expect(keys(s1)).toEqual(["be-1", "pp-1", "vp-1"]);
    const s2 = build(wrong("vp-1", "verb-patterns", 3, 2), wrong("vp-1", "verb-patterns", 4, 2), wrong("be-1", "be-verb", 1));
    const s3 = setDiagnostic(s2, { completedAt: at(0), level: "B1", byCategory: {}, focus: ["be-verb"] });
    expect(keys(s3)).toEqual(["vp-1", "be-1"]);
  });

  it("fills the rest with due mistake cards, without duplicates or phrase cards", () => {
    let s = build(wrong("be-1", "be-verb", 1), wrong("speak-1", "modals", 2), wrong("speak-2", "linking", 3));
    s = addPhraseCards(s, 1, [{ en: "make a decision", ru: "принять решение", category: "collocations" }], D0, at(4));
    // An extra mistake card with no error entry, overdue since yesterday.
    s = {
      ...s,
      cards: { ...s.cards, "m:old": { ...s.cards["m:speak-1"], id: "m:old", due: "2026-10-18" } },
    };
    s = { ...s, errors: without(s.errors, "speak-2") };
    const items = buildDrill(s, DAYS, D0);
    expect(items.map((i) => i.key)).toEqual(["m:speak-1", "be-1", "m:old", "m:speak-2"]);
    expect(items.filter((i) => i.kind === "card").map((i) => (i.kind === "card" ? i.cardId : ""))).toEqual([
      "m:speak-1",
      "m:old",
      "m:speak-2",
    ]);
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
  });

  it("does not add the card of a mistake already drilled as an exercise", () => {
    const s = build(wrong("be-1", "be-verb", 1));
    expect(s.cards["m:be-1"]).toBeDefined();
    expect(keys(s)).toEqual(["be-1"]);
  });

  it("only fills with cards that are due", () => {
    let s = build(wrong("speak-1", "modals", 1), wrong("speak-2", "linking", 2));
    s = reviewCard(s, "m:speak-2", 5, D0, at(5));
    s = { ...s, errors: without(s.errors, "speak-2") };
    expect(keys(s)).toEqual(["m:speak-1"]);
    expect(keys(s, undefined, D1)).toEqual(["m:speak-1", "m:speak-2"]);
  });

  it("respects the limit", () => {
    const steps = Array.from({ length: 14 }, (_, i) => wrong(`s-${String(i).padStart(2, "0")}`, "modals", i));
    const s = build(...steps);
    expect(buildDrill(s, DAYS, D0)).toHaveLength(DRILL_LIMIT);
    expect(DRILL_LIMIT).toBe(10);
    expect(drillSize(s, DAYS, D0)).toBe(10);
    expect(buildDrill(s, DAYS, D0, 3)).toHaveLength(3);
    expect(buildDrill(s, DAYS, D0, 0)).toEqual([]);
    expect(buildDrill(s, DAYS, D0, -2)).toEqual([]);
    expect(buildDrill(s, DAYS, D0, 30)).toHaveLength(14);
    expect(keys(s, 2)).toEqual(["m:s-13", "m:s-12"]);
  });

  it("works without any content", () => {
    const s = build(wrong("be-1", "be-verb", 1));
    expect(buildDrill(s, [], D0)).toEqual([{ kind: "card", key: "m:be-1", cardId: "m:be-1" }]);
  });
});
