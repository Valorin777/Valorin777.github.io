import { describe, expect, it } from "vitest";
import type { Day, Phrase, Topic } from "@/lib/content/schema";
import {
  addPhraseCards,
  addSeconds,
  completeStep,
  DEFAULT_SETTINGS,
  dueCount,
  emptyDay,
  EPOCH_ISO,
  getDayProgress,
  initialState,
  isDayUnlocked,
  migrate,
  phraseCardId,
  recordAnswer,
  dayHasProgress,
  resetDay,
  resetProgress,
  reviewCard,
  setDiagnostic,
  setFinalTest,
  setOverride,
  setPosition,
  startDay,
  STORAGE_VERSION,
  topErrors,
  topicMastery,
  touch,
  touchStreak,
  updateSettings,
} from "@/lib/progress";
import type { AnswerInput } from "@/lib/progress";
import type { AppState, DiagnosticResult, FinalTestResult } from "@/types/state";

const T1 = "2026-10-19T09:00:00.000Z";
const T2 = "2026-10-19T09:05:00.000Z";
const D0 = "2026-10-19";

const DIAG: DiagnosticResult = {
  completedAt: T1,
  level: "B1+",
  byCategory: { "be-verb": { correct: 1, total: 2 }, perfect: { correct: 2, total: 2 } },
  focus: ["be-verb", "perfect"],
};

const FINAL: FinalTestResult = {
  completedAt: T2,
  answers: { "p1-a:1": { given: "despite", correct: true }, "p2-a:1": { given: "", correct: false } },
  part1: { correct: 1, total: 1 },
  part2: { correct: 0, total: 1 },
  byCategory: { linking: { correct: 1, total: 2 } },
  percent: 50,
  band: "Strong B1",
};

function wrong(extra: Partial<AnswerInput> = {}): AnswerInput {
  return {
    day: 1,
    key: "be-1",
    correct: false,
    category: "be-verb",
    prompt: "The film ___ at eight. (start)",
    given: "is started",
    right: "started",
    rule: "be only with -ing or V3",
    nowIso: T1,
    today: D0,
    ...extra,
  };
}

describe("initial state and settings", () => {
  it("starts empty with default settings", () => {
    const s = initialState();
    expect(s.version).toBe(STORAGE_VERSION);
    expect(s.updatedAt).toBe("1970-01-01T00:00:00.000Z");
    expect(s.updatedAt).toBe(EPOCH_ISO);
    expect(s.diagnostic).toBeNull();
    expect(s.finalTest).toBeNull();
    expect(s.settings).toEqual({
      theme: "system",
      voiceURI: null,
      neuralVoice: "oa-marin",
      rate: 0.95,
      sound: false,
      haptics: true,
      showRu: false,
    });
    expect(s.position).toBeNull();
    expect(s.streak).toEqual({ current: 0, best: 0, lastDay: null });
    expect(getDayProgress(s, 3)).toEqual(emptyDay());
  });

  it("updates settings immutably and clamps the rate", () => {
    const s = initialState();
    const next = updateSettings(s, { rate: 3, theme: "dark" });
    expect(next.settings.rate).toBe(1.2);
    expect(next.settings.theme).toBe("dark");
    expect(s.settings).toEqual(DEFAULT_SETTINGS);
    expect(updateSettings(s, { rate: 0.1 }).settings.rate).toBe(0.6);
    expect(updateSettings(next, { rate: undefined }).settings.rate).toBe(1.2);
  });

  it("switches the neural voice off and on", () => {
    const off = updateSettings(initialState(), { neuralVoice: null });
    expect(off.settings.neuralVoice).toBeNull();
    expect(updateSettings(off, { neuralVoice: "a1-orion" }).settings.neuralVoice).toBe("a1-orion");
    expect(updateSettings(off, { neuralVoice: undefined }).settings.neuralVoice).toBeNull();
  });
});

describe("migrate", () => {
  it("never throws on garbage", () => {
    for (const raw of [null, undefined, 42, "{not json", [], [1, 2], true, { version: "x" }]) {
      expect(migrate(raw)).toEqual(initialState());
    }
  });

  it("fills defaults into partial data and parses JSON strings", () => {
    const s = migrate(JSON.stringify({ settings: { theme: "light" } }));
    expect(s.settings).toEqual({ ...DEFAULT_SETTINGS, theme: "light" });
    expect(s.days).toEqual({});
  });

  it("drops wrong types and clamps the rate", () => {
    const s = migrate({
      settings: { theme: "neon", rate: 9, sound: "yes", haptics: false, voiceURI: 7 },
      position: { day: 99, stepId: "x" },
      days: {
        1: { doneSteps: ["a", "a", 5, "b"], answers: { x: { correct: true, attempts: 2, firstTry: false }, y: 3 }, seconds: -5 },
        abc: { doneSteps: [] },
        9: { doneSteps: ["z"] },
        2: "nope",
      },
      cards: {
        good: { front: "f", back: "b", category: "be-verb", source: "mistake", day: 1, createdAt: T1, ef: 0.5, due: "bad" },
        bad: { front: "f", back: "b", category: "space", source: "mistake" },
      },
      errors: { e: { category: "perfect", prompt: "p", right: "r", count: -3 }, junk: { prompt: 1 } },
      streak: { current: 4, best: 2, lastDay: "yesterday" },
    });
    expect(s.settings).toEqual({ ...DEFAULT_SETTINGS, rate: 1.2, haptics: false });
    expect(s.position).toBeNull();
    expect(Object.keys(s.days)).toEqual(["1"]);
    expect(s.days[1].doneSteps).toEqual(["a", "b"]);
    expect(s.days[1].answers).toEqual({ x: { correct: true, attempts: 2, firstTry: false } });
    expect(s.days[1].seconds).toBe(0);
    expect(Object.keys(s.cards)).toEqual(["good"]);
    expect(s.cards.good.ef).toBe(1.3);
    expect(s.cards.good.due).toBe(D0);
    expect(s.cards.good.id).toBe("good");
    expect(s.errors.e.count).toBe(1);
    expect(s.errors.junk).toBeUndefined();
    expect(s.streak).toEqual({ current: 4, best: 4, lastDay: null });
  });

  it("round-trips a valid state", () => {
    let s = initialState();
    s = recordAnswer(s, wrong());
    s = completeStep(s, 1, "be:rule:0", "be:rule:1", T1);
    s = touchStreak(s, D0);
    s = updateSettings(s, { voiceURI: "Samantha", neuralVoice: null });
    s = setDiagnostic(s, DIAG);
    s = setFinalTest(s, FINAL);
    s = touch(s, T2);
    const back = migrate(JSON.parse(JSON.stringify(s)));
    expect(back).toEqual(s);
    expect(back.settings.neuralVoice).toBeNull();
  });

  it("upgrades a Phase 1 state that has none of the new fields", () => {
    const phase1 = {
      version: 1,
      settings: { theme: "dark", voiceURI: "Daniel", rate: 1, sound: true, haptics: true, showRu: false },
      position: { day: 1, stepId: "ex:be-1" },
      days: { 1: { doneSteps: ["be:rule:0"], answers: { "be-1": { correct: true, attempts: 1, firstTry: true } }, seconds: 120, startedAt: T1 } },
      cards: {},
      errors: {},
      streak: { current: 1, best: 1, lastDay: D0 },
    };
    const s = migrate(JSON.stringify(phase1));
    expect(s.updatedAt).toBe(EPOCH_ISO);
    expect(s.diagnostic).toBeNull();
    expect(s.finalTest).toBeNull();
    expect(s.settings).toEqual({ ...phase1.settings, neuralVoice: "oa-marin" });
    expect(s.position).toEqual(phase1.position);
    expect(s.days[1]).toEqual(phase1.days[1]);
    expect(s.streak).toEqual(phase1.streak);
  });

  it("keeps an unknown neural voice id and repairs bad ones", () => {
    expect(migrate({ settings: { neuralVoice: "a2-someone-new" } }).settings.neuralVoice).toBe("a2-someone-new");
    expect(migrate({ settings: { neuralVoice: null } }).settings.neuralVoice).toBeNull();
    expect(migrate({ settings: { neuralVoice: 5 } }).settings.neuralVoice).toBe("oa-marin");
    expect(migrate({ settings: { neuralVoice: "  " } }).settings.neuralVoice).toBe("oa-marin");
  });

  it("keeps a valid updatedAt and replaces a missing one", () => {
    expect(migrate({ updatedAt: T2 }).updatedAt).toBe(T2);
    expect(migrate({ updatedAt: 5 }).updatedAt).toBe(EPOCH_ISO);
  });

  it("validates the diagnostic", () => {
    expect(migrate({ diagnostic: DIAG }).diagnostic).toEqual(DIAG);
    expect(migrate({ diagnostic: { level: "B2" } }).diagnostic).toBeNull();
    expect(migrate({ diagnostic: "x" }).diagnostic).toBeNull();
    const d = migrate({
      diagnostic: {
        completedAt: T1,
        level: "C2",
        byCategory: { "be-verb": { correct: 5, total: 2 }, space: { correct: 1, total: 1 }, perfect: 3 },
        focus: ["perfect", "space", "perfect", 4, "be-verb"],
      },
    }).diagnostic;
    expect(d).toEqual({
      completedAt: T1,
      level: null,
      byCategory: { "be-verb": { correct: 2, total: 2 } },
      focus: ["perfect", "be-verb"],
    });
  });

  it("validates the final test", () => {
    expect(migrate({ finalTest: FINAL }).finalTest).toEqual(FINAL);
    expect(migrate({ finalTest: { percent: 80 } }).finalTest).toBeNull();
    const f = migrate({
      finalTest: {
        completedAt: T2,
        answers: { a: { given: 3, correct: true }, b: { given: "x" }, c: { given: "y", correct: false } },
        part1: { correct: 3, total: 4 },
        part2: "bad",
        percent: 140,
        band: "C1",
      },
    }).finalTest;
    expect(f).toEqual({
      completedAt: T2,
      answers: { a: { given: "", correct: true }, c: { given: "y", correct: false } },
      part1: { correct: 3, total: 4 },
      part2: { correct: 0, total: 0 },
      byCategory: {},
      percent: 100,
      band: "B2 ready",
    });
    const computed = migrate({ finalTest: { completedAt: T2, part1: { correct: 1, total: 2 }, part2: { correct: 0, total: 1 } } }).finalTest;
    expect(computed?.percent).toBe(33);
    expect(computed?.band).toBe("B1");
  });

  it("ignores prototype keys", () => {
    const s = migrate(JSON.parse("{\"cards\":{\"__proto__\":{\"front\":\"f\",\"back\":\"b\",\"category\":\"be-verb\",\"source\":\"phrase\"}}}"));
    expect(Object.keys(s.cards)).toEqual([]);
    expect(Object.getPrototypeOf(s.cards)).toBe(Object.prototype);
  });
});

describe("days and position", () => {
  it("unlocks day 1 always and later days after the previous one or an override", () => {
    let s = initialState();
    expect(isDayUnlocked(s, 1)).toBe(true);
    expect(isDayUnlocked(s, 2)).toBe(false);
    expect(isDayUnlocked(s, 0)).toBe(false);
    s = completeStep(s, 1, "done", null, T1);
    expect(isDayUnlocked(s, 2)).toBe(true);
    expect(isDayUnlocked(s, 3)).toBe(false);
    s = setOverride(s, 3);
    expect(isDayUnlocked(s, 3)).toBe(true);
    expect(setOverride(s, 3)).toBe(s);
  });

  it("treats Day 7 (the test day) like any other day", () => {
    let s = initialState();
    expect(isDayUnlocked(s, 7)).toBe(false);
    s = completeStep(s, 6, "done", null, T1);
    expect(isDayUnlocked(s, 7)).toBe(true);
    expect(isDayUnlocked(setOverride(initialState(), 7), 7)).toBe(true);
    s = completeStep(s, 7, "done", null, T2);
    expect(s.days[7].completedAt).toBe(T2);
    expect(s.days[7].doneSteps).toEqual(["done"]);
  });

  it("sets startedAt once", () => {
    const s1 = startDay(initialState(), 1, T1);
    expect(s1.days[1].startedAt).toBe(T1);
    const s2 = startDay(s1, 1, T2);
    expect(s2).toBe(s1);
  });

  it("completes steps without duplicates, moves the position and finishes the day once", () => {
    const s0 = initialState();
    const s1 = completeStep(s0, 1, "a", "b", T1);
    const s2 = completeStep(s1, 1, "a", "b", T2);
    expect(s2.days[1].doneSteps).toEqual(["a"]);
    expect(s2.position).toEqual({ day: 1, stepId: "b" });
    expect(s0.days[1]).toBeUndefined();
    const s3 = completeStep(s2, 1, "done", null, T1);
    expect(s3.days[1].completedAt).toBe(T1);
    expect(s3.position).toEqual({ day: 1, stepId: "b" });
    expect(completeStep(s3, 1, "done", null, T2).days[1].completedAt).toBe(T1);
    expect("completedAt" in s2.days[1]).toBe(false);
  });

  it("sets the position and adds time", () => {
    const s = setPosition(initialState(), 2, "ex:x");
    expect(s.position).toEqual({ day: 2, stepId: "ex:x" });
    expect(setPosition(s, 2, "ex:x")).toBe(s);
    const t = addSeconds(addSeconds(s, 2, 30), 2, 15);
    expect(t.days[2].seconds).toBe(45);
    expect(addSeconds(t, 2, -10)).toBe(t);
    expect(addSeconds(t, 2, Number.NaN)).toBe(t);
  });
});

describe("recordAnswer", () => {
  it("records first-try success", () => {
    const s = recordAnswer(initialState(), wrong({ correct: true, given: "started" }));
    expect(s.days[1].answers["be-1"]).toEqual({ correct: true, attempts: 1, firstTry: true });
    expect(s.errors).toEqual({});
    expect(s.cards).toEqual({});
  });

  it("logs a wrong answer and creates a mistake card once", () => {
    const s0 = initialState();
    const s1 = recordAnswer(s0, wrong());
    expect(s0.errors).toEqual({});
    expect(s1.days[1].answers["be-1"]).toEqual({ correct: false, attempts: 1, firstTry: false });
    expect(s1.errors["be-1"]).toMatchObject({ count: 1, wrong: "is started", right: "started", firstAt: T1, lastAt: T1 });
    expect(s1.cards["m:be-1"]).toMatchObject({
      id: "m:be-1",
      front: "The film ___ at eight. (start)",
      back: "started",
      note: "be only with -ing or V3",
      source: "mistake",
      category: "be-verb",
      day: 1,
      createdAt: T1,
      due: D0,
      reps: 0,
    });

    const s2 = recordAnswer(s1, wrong({ given: "was started", nowIso: T2 }));
    expect(Object.keys(s2.cards)).toEqual(["m:be-1"]);
    expect(s2.cards["m:be-1"]).toBe(s1.cards["m:be-1"]);
    expect(s2.errors["be-1"]).toMatchObject({ count: 2, wrong: "was started", firstAt: T1, lastAt: T2 });
    expect(s2.days[1].answers["be-1"]).toEqual({ correct: false, attempts: 2, firstTry: false });

    const s3 = recordAnswer(s2, wrong({ correct: true, given: "started" }));
    expect(s3.days[1].answers["be-1"]).toEqual({ correct: true, attempts: 3, firstTry: false });
    const s4 = recordAnswer(s3, wrong());
    expect(s4.days[1].answers["be-1"]).toEqual({ correct: true, attempts: 3, firstTry: false });
    expect(s4.errors["be-1"].count).toBe(3);
  });

  it("makes a learned mistake card due again today", () => {
    let s = recordAnswer(initialState(), wrong());
    s = reviewCard(s, "m:be-1", 5, D0, T1);
    expect(s.cards["m:be-1"].due).toBe("2026-10-20");
    s = recordAnswer(s, wrong({ today: D0 }));
    expect(s.cards["m:be-1"].due).toBe(D0);
    expect(s.cards["m:be-1"].reps).toBe(1);
    expect(dueCount(s, D0)).toBe(1);
  });
});

describe("cards", () => {
  const phrases: Phrase[] = [
    { en: "I'm looking forward to it.", ru: "Жду с нетерпением.", category: "verb-patterns" },
    { en: "make a decision", ru: "принять решение", category: "collocations" },
    { en: "Make a decision!", ru: "дубль", category: "collocations" },
  ];

  it("builds stable slug ids for phrases", () => {
    expect(phraseCardId("I'm looking forward to it.")).toBe("p:im-looking-forward-to-it");
    expect(phraseCardId("  Make  a decision ")).toBe("p:make-a-decision");
    expect(phraseCardId("!!!")).toMatch(/^p:[0-9a-z]+$/);
  });

  it("adds phrase cards idempotently", () => {
    const s1 = addPhraseCards(initialState(), 1, phrases, D0, T1);
    expect(Object.keys(s1.cards).sort()).toEqual(["p:im-looking-forward-to-it", "p:make-a-decision"]);
    expect(s1.cards["p:make-a-decision"]).toMatchObject({ front: "принять решение", back: "make a decision", source: "phrase", due: D0 });
    expect(addPhraseCards(s1, 1, phrases, "2026-10-20", T2)).toBe(s1);
  });

  it("reviews a card and counts due cards", () => {
    const s1 = addPhraseCards(initialState(), 1, phrases, D0, T1);
    expect(dueCount(s1, D0)).toBe(2);
    const s2 = reviewCard(s1, "p:make-a-decision", 4, D0, T2);
    expect(s2.cards["p:make-a-decision"]).toMatchObject({ interval: 1, reps: 1, due: "2026-10-20", lastReviewedAt: T2, back: "make a decision" });
    expect(s1.cards["p:make-a-decision"].reps).toBe(0);
    expect(dueCount(s2, D0)).toBe(1);
    expect(dueCount(s2, "2026-10-20")).toBe(2);
    expect(reviewCard(s2, "missing", 4, D0, T2)).toBe(s2);
  });
});

describe("touchStreak", () => {
  it("counts consecutive days across month and year boundaries", () => {
    let s = touchStreak(initialState(), "2026-10-30");
    expect(s.streak).toEqual({ current: 1, best: 1, lastDay: "2026-10-30" });
    expect(touchStreak(s, "2026-10-30")).toBe(s);
    s = touchStreak(s, "2026-10-31");
    s = touchStreak(s, "2026-11-01");
    expect(s.streak).toEqual({ current: 3, best: 3, lastDay: "2026-11-01" });
    s = touchStreak(s, "2026-11-03");
    expect(s.streak).toEqual({ current: 1, best: 3, lastDay: "2026-11-03" });
    let y = touchStreak(initialState(), "2026-12-31");
    y = touchStreak(y, "2027-01-01");
    expect(y.streak.current).toBe(2);
  });

  it("ignores a clock that went backwards", () => {
    const s = touchStreak(initialState(), "2026-10-30");
    expect(touchStreak(s, "2026-10-29")).toBe(s);
  });
});

describe("results and change stamp", () => {
  it("stores the diagnostic and the final test without touching the input", () => {
    const s0 = initialState();
    const s1 = setDiagnostic(s0, DIAG);
    expect(s1.diagnostic).toEqual(DIAG);
    expect(s0.diagnostic).toBeNull();
    const s2 = setFinalTest(s1, FINAL);
    expect(s2.finalTest).toEqual(FINAL);
    expect(s2.diagnostic).toEqual(DIAG);
    expect(s1.finalTest).toBeNull();
  });

  it("touch sets updatedAt and keeps the object when nothing changes", () => {
    const s0 = initialState();
    const s1 = touch(s0, T1);
    expect(s1.updatedAt).toBe(T1);
    expect(s0.updatedAt).toBe(EPOCH_ISO);
    expect(touch(s1, T1)).toBe(s1);
    expect(touch(s1, T2).updatedAt).toBe(T2);
  });
});

describe("reset, mastery and top errors", () => {
  it("resets everything but settings", () => {
    let s = updateSettings(initialState(), { theme: "dark" });
    s = recordAnswer(s, wrong());
    s = touchStreak(s, D0);
    s = setDiagnostic(setFinalTest(s, FINAL), DIAG);
    s = recordAnswer(s, wrong({ day: 0, key: "tense-past-simple-x" }));
    s = resetDay(s, 2, T1);
    const r = resetProgress(s, T2);
    expect(r.diagnostic).toBeNull();
    expect(r.finalTest).toBeNull();
    expect(r).toEqual({
      ...initialState(),
      updatedAt: s.updatedAt,
      settings: { ...DEFAULT_SETTINGS, theme: "dark" },
      resetAt: T2,
    });
  });

  it("starts one day over: its steps, answers, cards, mistakes and position; later days stay open", () => {
    let s = initialState();
    s = completeStep(s, 1, "a:rule:0", "a:rule:1", T1);
    s = recordAnswer(s, wrong());
    s = addPhraseCards(s, 1, [{ en: "make a decision", ru: "принять решение", category: "collocations" }], D0, T1);
    s = completeStep(s, 2, "b:rule:0", "b:rule:1", T1);
    s = recordAnswer(s, wrong({ day: 2, key: "pp-2", category: "perfect" }));
    s = recordAnswer(s, wrong({ day: 0, key: "tense-x", category: "perfect" }));
    s = setPosition(s, 1, "a:rule:1");
    s = touchStreak(s, D0);
    expect(dayHasProgress(s, 1)).toBe(true);

    const r = resetDay(s, 1, T2);
    expect(r.days[1]).toBeUndefined();
    expect(Object.values(r.cards).filter((c) => c.day === 1)).toEqual([]);
    expect(Object.values(r.errors).filter((e) => e.day === 1)).toEqual([]);
    expect(r.position).toBeNull();
    expect(r.dayResets).toEqual({ 1: T2 });
    expect(dayHasProgress(r, 1)).toBe(false);
    // Day 2 and the practice day are untouched; Day 2 stays unlocked although Day 1 is redone.
    expect(r.days[2]?.doneSteps).toEqual(["b:rule:0"]);
    expect(r.days[2]?.override).toBe(true);
    expect(isDayUnlocked(r, 2)).toBe(true);
    expect(r.errors["pp-2"]).toBeDefined();
    expect(r.errors["tense-x"]?.day).toBe(0);
    expect(r.streak).toEqual(s.streak);
  });

  it("starting Day 7 over clears the test result", () => {
    let s = setFinalTest(initialState(), FINAL);
    expect(dayHasProgress(s, 7)).toBe(true);
    s = resetDay(s, 7, T2);
    expect(s.finalTest).toBeNull();
    expect(dayHasProgress(s, 7)).toBe(false);
  });

  it("keeps practice outside the days (day 0) and reset times through a reload", () => {
    let s = recordAnswer(initialState(), wrong({ day: 0, key: "tense-present-perfect-x", correct: true }));
    s = recordAnswer(s, wrong({ day: 0, key: "coach:i-was-went" }));
    s = resetDay(s, 3, T1);
    s = { ...s, resetAt: T2 };
    const back = migrate(JSON.parse(JSON.stringify(s)));
    expect(back.days[0]?.answers["tense-present-perfect-x"]?.correct).toBe(true);
    expect(back.errors["coach:i-was-went"]?.day).toBe(0);
    expect(back.cards["m:coach:i-was-went"]?.day).toBe(0);
    expect(back.dayResets).toEqual({ 3: T1 });
    expect(back.resetAt).toBe(T2);
    expect(migrate({ ...s, resetAt: "not a date", dayResets: { 9: T1, x: T1, 2: 5 } }).dayResets).toEqual({});
  });

  it("computes first-try mastery per topic", () => {
    const topic = (id: string, exIds: string[]): Topic =>
      ({
        id,
        title: `T ${id}`,
        category: "perfect",
        exercises: exIds.map((e) => ({ id: e, type: "choice" })),
      }) as unknown as Topic;
    const day = { topics: [topic("a", ["a1", "a2", "a3"]), topic("b", ["b1"])] } as unknown as Day;
    const p = {
      ...emptyDay(),
      answers: {
        a1: { correct: true, attempts: 1, firstTry: true },
        a2: { correct: true, attempts: 2, firstTry: false },
      },
    };
    expect(topicMastery(day, p)).toEqual([
      { topicId: "a", title: "T a", category: "perfect", correct: 1, total: 3, ratio: 0.5 },
      { topicId: "b", title: "T b", category: "perfect", correct: 0, total: 1, ratio: 0 },
    ]);
  });

  it("sorts errors by count, then most recent", () => {
    let s: AppState = initialState();
    s = recordAnswer(s, wrong({ key: "a", nowIso: "2026-10-19T08:00:00.000Z" }));
    s = recordAnswer(s, wrong({ key: "b", nowIso: "2026-10-19T09:00:00.000Z" }));
    s = recordAnswer(s, wrong({ key: "c", nowIso: "2026-10-19T07:00:00.000Z" }));
    s = recordAnswer(s, wrong({ key: "c", nowIso: "2026-10-19T07:30:00.000Z" }));
    expect(topErrors(s).map((e) => e.key)).toEqual(["c", "b", "a"]);
    expect(topErrors(s, 2).map((e) => e.key)).toEqual(["c", "b"]);
  });
});
