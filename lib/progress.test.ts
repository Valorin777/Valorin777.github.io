import { describe, expect, it } from "vitest";
import type { Day, Phrase, Topic } from "@/lib/content/schema";
import {
  addPhraseCards,
  addSeconds,
  completeStep,
  DEFAULT_SETTINGS,
  dueCount,
  emptyDay,
  getDayProgress,
  initialState,
  isDayUnlocked,
  migrate,
  phraseCardId,
  recordAnswer,
  resetProgress,
  reviewCard,
  setOverride,
  setPosition,
  startDay,
  STORAGE_VERSION,
  topErrors,
  topicMastery,
  touchStreak,
  updateSettings,
} from "@/lib/progress";
import type { AnswerInput } from "@/lib/progress";
import type { AppState } from "@/types/state";

const T1 = "2026-10-19T09:00:00.000Z";
const T2 = "2026-10-19T09:05:00.000Z";
const D0 = "2026-10-19";

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
    expect(s.settings).toEqual({
      theme: "system",
      voiceURI: null,
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
    s = updateSettings(s, { voiceURI: "Samantha" });
    expect(migrate(JSON.parse(JSON.stringify(s)))).toEqual(s);
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

describe("reset, mastery and top errors", () => {
  it("resets everything but settings", () => {
    let s = updateSettings(initialState(), { theme: "dark" });
    s = recordAnswer(s, wrong());
    s = touchStreak(s, D0);
    const r = resetProgress(s);
    expect(r).toEqual({ ...initialState(), settings: { ...DEFAULT_SETTINGS, theme: "dark" } });
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
