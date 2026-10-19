import { describe, expect, it } from "vitest";
import { CoachBodySchema, DeviceIdSchema, ExplainBodySchema, LIMITS } from "./schemas";

const explain = {
  exerciseId: "d1-be-03",
  task: "Yesterday the meeting ___ at nine.",
  given: "is started",
  right: "started",
  rule: "be + V3 = passive; past simple has no be",
  category: "be-verb",
  lang: "en",
};

const coach = {
  history: [
    { role: "assistant", text: "Hi! What did you do at the weekend?" },
    { role: "user", text: "I am went to the park with my friends" },
  ],
  scenario: "Small talk about the weekend",
  focus: ["extra be", "past simple"],
  level: "B1",
};

describe("ExplainBodySchema", () => {
  it("accepts a valid payload", () => {
    expect(ExplainBodySchema.safeParse(explain).success).toBe(true);
    expect(ExplainBodySchema.safeParse({ ...explain, lang: "ru", given: "" }).success).toBe(true);
  });

  it.each([
    ["exerciseId", LIMITS.exerciseId],
    ["task", LIMITS.task],
    ["given", LIMITS.given],
    ["right", LIMITS.right],
    ["rule", LIMITS.rule],
    ["category", LIMITS.category],
  ] as const)("caps %s at %i characters", (field, max) => {
    expect(ExplainBodySchema.safeParse({ ...explain, [field]: "a".repeat(max) }).success).toBe(true);
    expect(ExplainBodySchema.safeParse({ ...explain, [field]: "a".repeat(max + 1) }).success).toBe(false);
  });

  it("rejects unknown keys, missing fields, bad lang and wrong types", () => {
    expect(ExplainBodySchema.safeParse({ ...explain, extra: 1 }).success).toBe(false);
    const missing: Record<string, unknown> = { ...explain };
    delete missing.right;
    expect(ExplainBodySchema.safeParse(missing).success).toBe(false);
    expect(ExplainBodySchema.safeParse({ ...explain, lang: "de" }).success).toBe(false);
    expect(ExplainBodySchema.safeParse({ ...explain, given: 42 }).success).toBe(false);
    expect(ExplainBodySchema.safeParse({ ...explain, exerciseId: "" }).success).toBe(false);
    expect(ExplainBodySchema.safeParse(null).success).toBe(false);
  });
});

describe("CoachBodySchema", () => {
  it("accepts a valid payload", () => {
    expect(CoachBodySchema.safeParse(coach).success).toBe(true);
    expect(CoachBodySchema.safeParse({ ...coach, focus: [] }).success).toBe(true);
  });

  it("needs 1..30 turns and the last one from the learner", () => {
    expect(CoachBodySchema.safeParse({ ...coach, history: [] }).success).toBe(false);
    const turn = { role: "user", text: "hello" };
    expect(CoachBodySchema.safeParse({ ...coach, history: Array(30).fill(turn) }).success).toBe(true);
    expect(CoachBodySchema.safeParse({ ...coach, history: Array(31).fill(turn) }).success).toBe(false);
    const lastAssistant = [...coach.history, { role: "assistant", text: "Nice!" }];
    expect(CoachBodySchema.safeParse({ ...coach, history: lastAssistant }).success).toBe(false);
  });

  it("caps text sizes and list lengths", () => {
    const long = [{ role: "user", text: "a".repeat(LIMITS.turnText + 1) }];
    expect(CoachBodySchema.safeParse({ ...coach, history: long }).success).toBe(false);
    const max = [{ role: "user", text: "a".repeat(LIMITS.turnText) }];
    expect(CoachBodySchema.safeParse({ ...coach, history: max }).success).toBe(true);
    expect(CoachBodySchema.safeParse({ ...coach, scenario: "a".repeat(61) }).success).toBe(false);
    expect(CoachBodySchema.safeParse({ ...coach, focus: Array(7).fill("x") }).success).toBe(false);
    expect(CoachBodySchema.safeParse({ ...coach, focus: ["a".repeat(41)] }).success).toBe(false);
  });

  it("rejects bad roles, levels, empty turns and unknown keys", () => {
    expect(CoachBodySchema.safeParse({ ...coach, level: "C1" }).success).toBe(false);
    expect(CoachBodySchema.safeParse({ ...coach, history: [{ role: "system", text: "x" }] }).success).toBe(false);
    expect(CoachBodySchema.safeParse({ ...coach, history: [{ role: "user", text: "" }] }).success).toBe(false);
    expect(CoachBodySchema.safeParse({ ...coach, history: [{ role: "user", text: "hi", x: 1 }] }).success).toBe(false);
    expect(CoachBodySchema.safeParse({ ...coach, model: "other" }).success).toBe(false);
  });
});

describe("DeviceIdSchema", () => {
  it("accepts UUIDs and UUID-like ids up to 64 chars", () => {
    expect(DeviceIdSchema.safeParse("3f2b8c1e-9d4a-4f6b-8e2c-1a2b3c4d5e6f").success).toBe(true);
    expect(DeviceIdSchema.safeParse("a".repeat(64)).success).toBe(true);
  });

  it("rejects missing, short, long and odd ids", () => {
    expect(DeviceIdSchema.safeParse(null).success).toBe(false);
    expect(DeviceIdSchema.safeParse("abc").success).toBe(false);
    expect(DeviceIdSchema.safeParse("a".repeat(65)).success).toBe(false);
    expect(DeviceIdSchema.safeParse("abcd efgh-1234").success).toBe(false);
    expect(DeviceIdSchema.safeParse("../../etc/passwd").success).toBe(false);
  });
});
