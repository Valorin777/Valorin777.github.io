import { describe, expect, it } from "vitest";
import { DaySchema } from "@/lib/content/schema";
import type { Day, Exercise, Topic } from "@/lib/content/schema";
import {
  buildSteps,
  firstUndoneIndex,
  formatMinutes,
  progressRatio,
  remainingSeconds,
  SECTION_LABELS,
  sectionBounds,
  stepIndexById,
  totalSeconds,
} from "@/lib/steps";

const meta = { rule: "rule", explain: "Because." };

function exercises(prefix: string): Exercise[] {
  return [
    { ...meta, id: `${prefix}-c`, type: "choice", prompt: "It ___.", options: ["a", "b"], answer: 0 },
    { ...meta, id: `${prefix}-k`, type: "collocation", prompt: "make a ___", options: ["a", "b"], answer: 1 },
    { ...meta, id: `${prefix}-f`, type: "fill", before: "I ", after: ".", answers: ["went"] },
    { ...meta, id: `${prefix}-e`, type: "errorTap", sentence: "I am agree", wrong: 1, correct: "I agree" },
    { ...meta, id: `${prefix}-r`, type: "reorder", words: ["i", "agree", "now"] },
  ];
}

function topic(id: string, ruleSteps: number[]): Topic {
  return {
    id,
    title: `Topic ${id}`,
    summary: "Summary",
    category: "be-verb",
    rules: ruleSteps.map((n, i) => ({
      id: `card-${i}`,
      title: "Card",
      steps: Array.from({ length: n }, () => ({ kind: "text" as const, text: "Text" })),
    })),
    mistakes: [
      { wrong: "I am agree", right: "I agree", why: "Agree is a verb." },
      { wrong: "It is started", right: "It started", why: "Past simple." },
      { wrong: "I'm knew", right: "I knew", why: "No be." },
    ],
    ruNote: { text: "Заметка" },
    examples: Array.from({ length: 8 }, (_, i) => ({ en: `Example ${i}.`, ru: `Пример ${i}.` })),
    exercises: exercises(id),
  };
}

const day: Day = DaySchema.parse({
  number: 1,
  title: "Day 1",
  subtitle: "Be + verb",
  goal: "Use be only with -ing or V3.",
  topics: [topic("be-verb", [2, 3]), topic("past", [1])],
  speak: Array.from({ length: 6 }, (_, i) => ({
    id: `say-${i}`,
    ru: "Фильм начался в восемь.",
    en: ["The film started at eight."],
    category: "be-verb",
    focus: "no be",
  })),
  phrases: Array.from({ length: 4 }, (_, i) => ({ en: `phrase ${i}`, ru: `фраза ${i}`, category: "collocations" })),
});

const steps = buildSteps(day);
const ids = steps.map((s) => s.id);

describe("buildSteps", () => {
  it("orders topics' learn steps, then listening, speaking, review and done", () => {
    expect(ids.slice(0, 10)).toEqual([
      "be-verb:rule:0",
      "be-verb:rule:1",
      "be-verb:mistakes",
      "be-verb:ru",
      "ex:be-verb-c",
      "ex:be-verb-k",
      "ex:be-verb-f",
      "ex:be-verb-e",
      "ex:be-verb-r",
      "past:rule:0",
    ]);
    expect(ids.slice(17)).toEqual([
      "listen:be-verb",
      "listen:past",
      "speak:say-0",
      "speak:say-1",
      "speak:say-2",
      "speak:say-3",
      "speak:say-4",
      "speak:say-5",
      "review",
      "done",
    ]);
    expect(steps.length).toBe(27);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("assigns kinds, sections and indices", () => {
    expect(steps[1]).toEqual({
      id: "be-verb:rule:1",
      section: "learn",
      seconds: 30,
      kind: "rule",
      topicId: "be-verb",
      cardIndex: 1,
    });
    expect(steps[8]).toMatchObject({ kind: "exercise", topicId: "be-verb", exerciseIndex: 4 });
    expect(steps[19]).toMatchObject({ kind: "speak", section: "speak", itemIndex: 0 });
    expect(steps[17]).toMatchObject({ kind: "listen", section: "speak", topicId: "be-verb" });
    expect(steps[25]).toMatchObject({ kind: "review", section: "review" });
    expect(steps[26]).toMatchObject({ kind: "done", section: "review", seconds: 0 });
  });

  it("estimates seconds per step", () => {
    const sec = (id: string) => steps[stepIndexById(steps, id)].seconds;
    expect(sec("be-verb:rule:0")).toBe(22);
    expect(sec("be-verb:mistakes")).toBe(36);
    expect(sec("be-verb:ru")).toBe(20);
    expect(sec("ex:be-verb-c")).toBe(15);
    expect(sec("ex:be-verb-k")).toBe(15);
    expect(sec("ex:be-verb-e")).toBe(15);
    expect(sec("ex:be-verb-f")).toBe(24);
    expect(sec("ex:be-verb-r")).toBe(24);
    expect(sec("listen:past")).toBe(120);
    expect(sec("speak:say-3")).toBe(30);
    expect(sec("review")).toBe(600);
  });
});

describe("step navigation and time", () => {
  // learn: (22+30+36+20+93) + (14+36+20+93) = 364; speak: 240 + 180 = 420; review: 600
  const total = 364 + 420 + 600;

  it("finds steps by id", () => {
    expect(stepIndexById(steps, "review")).toBe(25);
    expect(stepIndexById(steps, "nope")).toBe(-1);
  });

  it("sums total and remaining time", () => {
    expect(totalSeconds(steps)).toBe(total);
    expect(remainingSeconds(steps, [])).toBe(total);
    expect(remainingSeconds(steps, ["be-verb:rule:0", "review", "unknown"])).toBe(total - 22 - 600);
    expect(remainingSeconds(steps, ids)).toBe(0);
  });

  it("reports progress weighted by time, reaching 1 only with done", () => {
    expect(progressRatio(steps, [])).toBe(0);
    expect(progressRatio(steps, ["review"])).toBeCloseTo(600 / (total + 1));
    const allButDone = ids.filter((id) => id !== "done");
    expect(progressRatio(steps, allButDone)).toBeLessThan(1);
    expect(progressRatio(steps, ids)).toBe(1);
    expect(progressRatio([], [])).toBe(0);
  });

  it("finds the first undone step", () => {
    expect(firstUndoneIndex(steps, [])).toBe(0);
    expect(firstUndoneIndex(steps, ["be-verb:rule:0", "be-verb:rule:1"])).toBe(2);
    expect(firstUndoneIndex(steps, ["be-verb:rule:1"])).toBe(0);
    expect(firstUndoneIndex(steps, ids)).toBe(26);
  });

  it("formats minutes", () => {
    expect(formatMinutes(0)).toBe("under a minute");
    expect(formatMinutes(59)).toBe("under a minute");
    expect(formatMinutes(300)).toBe("about 5 min");
    expect(formatMinutes(2400)).toBe("about 40 min");
    expect(formatMinutes(2530)).toBe("about 40 min");
    expect(formatMinutes(total)).toBe("about 25 min");
  });

  it("gives section ranges (end exclusive) and seconds", () => {
    expect(sectionBounds(steps)).toEqual({
      learn: { start: 0, end: 17, seconds: 364 },
      speak: { start: 17, end: 25, seconds: 420 },
      review: { start: 25, end: 27, seconds: 600 },
    });
    expect(SECTION_LABELS.speak).toBe("Listen & speak");
  });
});
