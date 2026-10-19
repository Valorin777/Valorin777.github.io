import { describe, expect, it } from "vitest";
import {
  addPhraseCards,
  completeStep,
  initialState,
  migrate,
  recordAnswer,
  reviewCard,
  setDiagnostic,
  setFinalTest,
  setOverride,
  touch,
  touchStreak,
  updateSettings,
} from "@/lib/progress";
import type { AnswerInput } from "@/lib/progress";
import { isEmptyProgress, mergeStates } from "@/lib/sync";
import type { AppState, Card, DiagnosticResult, FinalTestResult } from "@/types/state";

const D0 = "2026-10-19";
const D1 = "2026-10-20";
const at = (hh: number, mm = 0) => `2026-10-19T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00.000Z`;

function answer(extra: Partial<AnswerInput> = {}): AnswerInput {
  return {
    day: 1,
    key: "be-1",
    correct: false,
    category: "be-verb",
    prompt: "The film ___ at eight.",
    given: "is started",
    right: "started",
    rule: "be only with -ing or V3",
    nowIso: at(9),
    today: D0,
    ...extra,
  };
}

const diag = (completedAt: string, level: DiagnosticResult["level"]): DiagnosticResult => ({
  completedAt,
  level,
  byCategory: {},
  focus: ["perfect"],
});

const final = (completedAt: string, percent: number): FinalTestResult => ({
  completedAt,
  answers: {},
  part1: { correct: 0, total: 0 },
  part2: { correct: 0, total: 0 },
  byCategory: {},
  percent,
  band: "B1",
});

/** A phone that did Day 1's first steps and made two mistakes. */
function phone(): AppState {
  let s = initialState();
  s = completeStep(s, 1, "be:rule:0", "be:rule:1", at(9));
  s = recordAnswer(s, answer());
  s = recordAnswer(s, answer({ key: "pp-1", category: "perfect", nowIso: at(9, 5) }));
  s = addPhraseCards(s, 1, [{ en: "make a decision", ru: "принять решение", category: "collocations" }], D0, at(9, 10));
  s = touchStreak(s, D0);
  s = updateSettings(s, { theme: "dark" });
  return touch(s, at(9, 10));
}

/** A laptop that did other steps of Day 1, one of the same mistakes and Day 2's start. */
function laptop(): AppState {
  let s = initialState();
  s = completeStep(s, 1, "be:mistakes", null, at(8));
  s = completeStep(s, 1, "be:rule:0", "be:ru", at(8, 30));
  s = recordAnswer(s, answer({ nowIso: at(10), given: "was started" }));
  s = recordAnswer(s, answer({ nowIso: at(10, 1), given: "has started" }));
  s = recordAnswer(s, answer({ key: "be-2", correct: true, given: "started" }));
  s = setOverride(s, 2);
  s = completeStep(s, 2, "x:rule:0", "x:rule:1", at(11));
  s = touchStreak(s, D1);
  s = updateSettings(s, { theme: "light", neuralVoice: null });
  return touch(s, at(11));
}

describe("mergeStates", () => {
  it("is idempotent", () => {
    for (const s of [initialState(), phone(), laptop(), mergeStates(phone(), laptop())]) {
      expect(mergeStates(s, s)).toEqual(s);
    }
  });

  it("is commutative apart from doneSteps order", () => {
    const ab = mergeStates(phone(), laptop());
    const ba = mergeStates(laptop(), phone());
    const sortSteps = (s: AppState): AppState => ({
      ...s,
      days: Object.fromEntries(Object.entries(s.days).map(([k, d]) => [k, { ...d, doneSteps: [...d.doneSteps].sort() }])),
    });
    expect(sortSteps(ab)).toEqual(sortSteps(ba));
  });

  it("is associative enough to converge after a round trip", () => {
    const a = phone();
    const b = laptop();
    const ab = mergeStates(a, b);
    expect(mergeStates(ab, b)).toEqual(ab);
    expect(mergeStates(ab, a)).toEqual(ab);
  });

  it("does not mutate its inputs", () => {
    const a = phone();
    const b = laptop();
    const aCopy = structuredClone(a);
    const bCopy = structuredClone(b);
    mergeStates(a, b);
    expect(a).toEqual(aCopy);
    expect(b).toEqual(bCopy);
  });

  it("takes settings, position and updatedAt from the newer state", () => {
    const m = mergeStates(phone(), laptop());
    expect(m.settings.theme).toBe("light");
    expect(m.settings.neuralVoice).toBeNull();
    expect(m.position).toEqual({ day: 2, stepId: "x:rule:1" });
    expect(m.updatedAt).toBe(at(11));
    expect(mergeStates(laptop(), phone()).settings.theme).toBe("light");
  });

  it("keeps a's settings on an updatedAt tie", () => {
    const a = touch(updateSettings(initialState(), { theme: "dark" }), at(9));
    const b = touch(updateSettings(initialState(), { theme: "light" }), at(9));
    expect(mergeStates(a, b).settings.theme).toBe("dark");
    expect(mergeStates(b, a).settings.theme).toBe("light");
  });

  it("compares updatedAt as time, not text", () => {
    const a = touch(updateSettings(initialState(), { theme: "dark" }), "2026-10-19T10:00:00+03:00");
    const b = touch(updateSettings(initialState(), { theme: "light" }), "2026-10-19T08:00:00.000Z");
    expect(mergeStates(a, b).settings.theme).toBe("light");
    expect(mergeStates(b, a).settings.theme).toBe("light");
  });

  it("unions done steps keeping a's order", () => {
    const m = mergeStates(phone(), laptop());
    expect(m.days[1].doneSteps).toEqual(["be:rule:0", "be:mistakes"]);
    expect(mergeStates(laptop(), phone()).days[1].doneSteps).toEqual(["be:mistakes", "be:rule:0"]);
    expect(m.days[2].doneSteps).toEqual(["x:rule:0"]);
    expect(m.days[2].override).toBe(true);
  });

  it("merges answers per key", () => {
    const m = mergeStates(phone(), laptop());
    expect(m.days[1].answers["be-1"]).toEqual({ correct: false, attempts: 2, firstTry: false });
    expect(m.days[1].answers["pp-1"]).toEqual({ correct: false, attempts: 1, firstTry: false });
    expect(m.days[1].answers["be-2"]).toEqual({ correct: true, attempts: 1, firstTry: true });

    const ok = recordAnswer(initialState(), answer({ correct: true }));
    const fixed = recordAnswer(recordAnswer(recordAnswer(initialState(), answer()), answer()), answer({ correct: true }));
    expect(mergeStates(ok, fixed).days[1].answers["be-1"]).toEqual({ correct: true, attempts: 3, firstTry: false });
    expect(mergeStates(fixed, ok).days[1].answers["be-1"]).toEqual({ correct: true, attempts: 3, firstTry: false });
  });

  it("keeps the earliest start and completion, the most seconds and any override", () => {
    const a: AppState = {
      ...initialState(),
      days: { 3: { doneSteps: [], answers: {}, seconds: 100, startedAt: at(9), completedAt: at(12) } },
    };
    const b: AppState = {
      ...initialState(),
      days: { 3: { doneSteps: [], answers: {}, seconds: 40, startedAt: at(8), override: true } },
    };
    const want = { doneSteps: [], answers: {}, seconds: 100, startedAt: at(8), completedAt: at(12), override: true };
    expect(mergeStates(a, b).days[3]).toEqual(want);
    expect(mergeStates(b, a).days[3]).toEqual(want);
    const c: AppState = { ...initialState(), days: { 3: { doneSteps: [], answers: {}, seconds: 0, completedAt: at(10) } } };
    expect(mergeStates(a, c).days[3].completedAt).toBe(at(10));
    const plain = mergeStates(c, c).days[3];
    expect("override" in plain).toBe(false);
    expect("startedAt" in plain).toBe(false);
  });

  it("picks the more recently reviewed card", () => {
    const base = phone();
    const reviewed = reviewCard(base, "m:be-1", 5, D0, at(12));
    const m1 = mergeStates(base, reviewed);
    const m2 = mergeStates(reviewed, base);
    expect(m1.cards["m:be-1"]).toEqual(reviewed.cards["m:be-1"]);
    expect(m2.cards["m:be-1"]).toEqual(reviewed.cards["m:be-1"]);

    const later = reviewCard(reviewed, "m:be-1", 1, D1, at(13));
    expect(mergeStates(reviewed, later).cards["m:be-1"].lastReviewedAt).toBe(at(13));
    expect(mergeStates(later, reviewed).cards["m:be-1"].lastReviewedAt).toBe(at(13));
  });

  it("falls back to createdAt, then the earlier due date, then a", () => {
    const card = (createdAt: string, due: string, front = "f"): Card => ({
      id: "m:x",
      front,
      back: "b",
      category: "perfect",
      source: "mistake",
      day: 1,
      createdAt,
      ef: 2.5,
      interval: 0,
      reps: 0,
      due,
      lapses: 0,
    });
    const s = (c: Card): AppState => ({ ...initialState(), cards: { [c.id]: c } });
    expect(mergeStates(s(card(at(9), D1)), s(card(at(10), D1))).cards["m:x"].createdAt).toBe(at(10));
    expect(mergeStates(s(card(at(10), D1)), s(card(at(9), D1))).cards["m:x"].createdAt).toBe(at(10));
    expect(mergeStates(s(card(at(9), D1)), s(card(at(9), D0))).cards["m:x"].due).toBe(D0);
    expect(mergeStates(s(card(at(9), D0)), s(card(at(9), D1))).cards["m:x"].due).toBe(D0);
    expect(mergeStates(s(card(at(9), D0, "a")), s(card(at(9), D0, "b"))).cards["m:x"].front).toBe("a");
  });

  it("unions cards from both sides", () => {
    const m = mergeStates(phone(), laptop());
    expect(Object.keys(m.cards).sort()).toEqual(["m:be-1", "m:pp-1", "p:make-a-decision"]);
  });

  it("merges error entries", () => {
    const m = mergeStates(phone(), laptop());
    expect(m.errors["be-1"]).toMatchObject({ count: 2, firstAt: at(9), lastAt: at(10, 1), wrong: "has started" });
    expect(mergeStates(laptop(), phone()).errors["be-1"]).toEqual(m.errors["be-1"]);
    expect(m.errors["pp-1"]).toEqual(phone().errors["pp-1"]);

    const a = recordAnswer(initialState(), answer({ nowIso: at(7), given: "old" }));
    const b = recordAnswer(
      recordAnswer(recordAnswer(initialState(), answer({ nowIso: at(8), given: "x" })), answer({ nowIso: at(8, 1) })),
      answer({ nowIso: at(8, 2), given: "newest", prompt: "changed prompt" }),
    );
    const e = mergeStates(a, b).errors["be-1"];
    expect(e).toMatchObject({ count: 3, firstAt: at(7), lastAt: at(8, 2), wrong: "newest" });
  });

  it("takes later diagnostic and final test, non-null beating null", () => {
    const a = setDiagnostic(initialState(), diag(at(9), "B1"));
    const b = setDiagnostic(initialState(), diag(at(10), "B1+"));
    expect(mergeStates(a, b).diagnostic?.level).toBe("B1+");
    expect(mergeStates(b, a).diagnostic?.level).toBe("B1+");
    expect(mergeStates(a, initialState()).diagnostic?.level).toBe("B1");
    expect(mergeStates(initialState(), a).diagnostic?.level).toBe("B1");
    const tieA = setDiagnostic(initialState(), diag(at(9), null));
    expect(mergeStates(tieA, a).diagnostic?.level).toBeNull();

    const f1 = setFinalTest(initialState(), final(at(9), 40));
    const f2 = setFinalTest(initialState(), final(at(12), 80));
    expect(mergeStates(f1, f2).finalTest?.percent).toBe(80);
    expect(mergeStates(f2, f1).finalTest?.percent).toBe(80);
    expect(mergeStates(initialState(), f1).finalTest?.percent).toBe(40);
    expect(mergeStates(initialState(), initialState()).finalTest).toBeNull();
  });

  it("merges streaks", () => {
    const m = mergeStates(phone(), laptop());
    expect(m.streak).toEqual({ current: 1, best: 1, lastDay: D1 });

    const s = (current: number, best: number, lastDay: string | null): AppState => ({
      ...initialState(),
      streak: { current, best, lastDay },
    });
    expect(mergeStates(s(5, 7, D0), s(1, 2, D1)).streak).toEqual({ current: 1, best: 7, lastDay: D1 });
    expect(mergeStates(s(1, 2, D1), s(5, 7, D0)).streak).toEqual({ current: 1, best: 7, lastDay: D1 });
    expect(mergeStates(s(2, 2, D0), s(3, 3, D0)).streak).toEqual({ current: 3, best: 3, lastDay: D0 });
    expect(mergeStates(s(3, 3, D0), s(2, 2, D0)).streak).toEqual({ current: 3, best: 3, lastDay: D0 });
    expect(mergeStates(s(0, 0, null), s(2, 4, D0)).streak).toEqual({ current: 2, best: 4, lastDay: D0 });
  });

  it("keeps a valid state through migrate", () => {
    const m = mergeStates(phone(), laptop());
    expect(migrate(JSON.parse(JSON.stringify(m)))).toEqual(m);
  });

  it("ignores prototype keys from untrusted input", () => {
    const evil = JSON.parse("{\"__proto__\":{\"polluted\":true}}") as Record<string, Card>;
    const m = mergeStates(initialState(), { ...initialState(), cards: evil });
    expect(Object.getPrototypeOf(m.cards)).toBe(Object.prototype);
    expect((m.cards as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("isEmptyProgress", () => {
  it("is true for a fresh state, even with settings, position and streak", () => {
    expect(isEmptyProgress(initialState())).toBe(true);
    const s = touchStreak(touch(updateSettings(initialState(), { theme: "dark" }), at(9)), D0);
    expect(isEmptyProgress({ ...s, position: { day: 1, stepId: "a" } })).toBe(true);
  });

  it("is false once there is any learning data", () => {
    expect(isEmptyProgress(completeStep(initialState(), 1, "a", null, at(9)))).toBe(false);
    expect(isEmptyProgress(recordAnswer(initialState(), answer()))).toBe(false);
    expect(isEmptyProgress(addPhraseCards(initialState(), 1, [{ en: "x y", ru: "z", category: "modals" }], D0, at(9)))).toBe(false);
    expect(isEmptyProgress({ ...initialState(), errors: phone().errors })).toBe(false);
    expect(isEmptyProgress(setDiagnostic(initialState(), diag(at(9), null)))).toBe(false);
    expect(isEmptyProgress(setFinalTest(initialState(), final(at(9), 50)))).toBe(false);
  });
});
