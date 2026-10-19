import { describe, expect, it } from "vitest";
import { DaySchema, type ErrorTapExercise, type ReorderExercise } from "@/lib/content/schema";
import { DAYS, findTopic, getDay, listDays } from "@/content/index";
import { day1 } from "@/content/days/day-1";
import { LINTS, errorTapProblems, lintContent, reorderProblems } from "@/scripts/check-content";

describe("content API", () => {
  it("parses Day 1 with the schema", () => {
    expect(DaySchema.safeParse(day1).success).toBe(true);
    expect(DAYS.map((d) => d.number)).toEqual([1]);
  });

  it("getDay returns a day or null", () => {
    expect(getDay(1)?.title).toBe("The tense map");
    expect(getDay(2)).toBeNull();
    expect(getDay(99)).toBeNull();
  });

  it("listDays lists all seven days, only Day 1 available", () => {
    const days = listDays();
    expect(days.map((d) => d.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(days.filter((d) => d.available).map((d) => d.number)).toEqual([1]);
  });

  it("findTopic finds Day 1 topics in order", () => {
    const day = getDay(1);
    if (!day) throw new Error("Day 1 missing");
    expect(day.topics.map((t) => t.id)).toEqual([
      "be-rule",
      "present-simple-continuous",
      "past-simple-present-perfect",
      "past-perfect",
    ]);
    expect(findTopic(day, "past-perfect")?.category).toBe("perfect");
    expect(findTopic(day, "nope")).toBeUndefined();
  });
});

describe("Day 1 shape", () => {
  const day = DAYS[0];

  it.each(day.topics.map((t) => [t.id, t] as const))("%s has the agreed amount of material", (_id, t) => {
    expect(t.rules.length).toBeGreaterThanOrEqual(2);
    expect(t.rules.length).toBeLessThanOrEqual(3);
    t.rules.forEach((r) => {
      expect(r.steps.length).toBeGreaterThanOrEqual(2);
      expect(r.steps.length).toBeLessThanOrEqual(5);
    });
    expect(t.mistakes.length).toBeGreaterThanOrEqual(3);
    expect(t.mistakes.length).toBeLessThanOrEqual(4);
    expect(t.examples).toHaveLength(10);
    expect(t.exercises).toHaveLength(7);
  });

  it("has 10 speak items and 12 phrases", () => {
    expect(day.speak.length).toBeGreaterThanOrEqual(10);
    expect(day.phrases).toHaveLength(12);
  });
});

describe("integrity lints on real content", () => {
  const meta = listDays();
  it.each(Object.entries(LINTS))("%s", (_name, lint) => {
    expect(lint(DAYS, meta)).toEqual([]);
  });

  it("lintContent finds nothing", () => {
    expect(lintContent(DAYS, meta)).toEqual([]);
  });
});

describe("lints catch broken exercises", () => {
  const base = { id: "x", rule: "r", explain: "e" };

  it("errorTap: flags a fix that touches two tokens", () => {
    const e: ErrorTapExercise = {
      ...base,
      type: "errorTap",
      sentence: "I have seen him yesterday at work.",
      wrong: 1,
      correct: "I saw him yesterday at work.",
    };
    expect(errorTapProblems(e).length).toBeGreaterThan(0);
  });

  it("errorTap: flags the last token and an unchanged sentence", () => {
    const last: ErrorTapExercise = {
      ...base,
      type: "errorTap",
      sentence: "She works here every days.",
      wrong: 4,
      correct: "She works here every day.",
    };
    expect(errorTapProblems(last)).toContain("the wrong token is the last one and carries the final punctuation");
    expect(errorTapProblems({ ...last, correct: last.sentence })).toContain("correct is the same as sentence");
  });

  it("errorTap: accepts a deletion and a one-to-two-word replacement", () => {
    const del: ErrorTapExercise = {
      ...base,
      type: "errorTap",
      sentence: "It is depends on the weather.",
      wrong: 1,
      correct: "It depends on the weather.",
    };
    const rep: ErrorTapExercise = {
      ...base,
      type: "errorTap",
      sentence: "Look, it rains outside now.",
      wrong: 2,
      correct: "Look, it is raining outside now.",
    };
    expect(errorTapProblems(del)).toEqual([]);
    expect(errorTapProblems(rep)).toEqual([]);
  });

  it("reorder: flags a capitalised first word, punctuation and a missing question mark", () => {
    const e: ReorderExercise = { ...base, type: "reorder", words: ["Where", "is", "the", "station?"] };
    const problems = reorderProblems(e);
    expect(problems.some((p) => p.includes("capitalised"))).toBe(true);
    expect(problems.some((p) => p.includes("punctuation"))).toBe(true);
    expect(problems.some((p) => p.includes("'?'"))).toBe(true);
  });

  it("flags fill answers over four words, missing types and same-index choices", () => {
    const day = DaySchema.parse(day1);
    const topic = day.topics[0];
    const broken = {
      ...day,
      topics: [
        {
          ...topic,
          exercises: [
            { ...base, id: "c1", type: "choice" as const, prompt: "A ___ b.", options: ["x", "y", "z"], answer: 0 },
            { ...base, id: "c2", type: "choice" as const, prompt: "C ___ d.", options: ["x", "y", "z"], answer: 0 },
            {
              ...base,
              id: "f1",
              type: "fill" as const,
              before: "I ",
              after: " today.",
              answers: ["have been working very hard"],
            },
          ],
        },
      ],
    };
    const problems = lintContent([broken], listDays()).map((p) => p.message);
    expect(problems).toContain("no errorTap exercise");
    expect(problems).toContain("no reorder exercise");
    expect(problems).toContain("every choice answer is option 0");
    expect(problems.some((m) => m.includes("longer than 4 words"))).toBe(true);
  });
});
