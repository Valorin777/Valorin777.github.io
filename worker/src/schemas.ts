import { z } from "zod";

export const LIMITS = {
  exerciseId: 80,
  task: 400,
  given: 200,
  right: 200,
  rule: 160,
  category: 40,
  turnText: 400,
  historyMax: 16,
  scenario: 60,
  focusItems: 6,
  focusItem: 40,
  bodyBytes: 8 * 1024,
} as const;

export const LangSchema = z.enum(["en", "ru"]);
export type Lang = z.infer<typeof LangSchema>;

export const ExplainBodySchema = z.strictObject({
  exerciseId: z.string().min(1).max(LIMITS.exerciseId),
  task: z.string().min(1).max(LIMITS.task),
  given: z.string().max(LIMITS.given),
  right: z.string().min(1).max(LIMITS.right),
  rule: z.string().max(LIMITS.rule),
  category: z.string().min(1).max(LIMITS.category),
  lang: LangSchema,
});
export type ExplainBody = z.infer<typeof ExplainBodySchema>;

export const CoachTurnSchema = z.strictObject({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(LIMITS.turnText),
});
export type CoachTurn = z.infer<typeof CoachTurnSchema>;

export const CoachBodySchema = z.strictObject({
  history: z
    .array(CoachTurnSchema)
    .min(1)
    .max(LIMITS.historyMax)
    .refine((turns) => turns[turns.length - 1]?.role === "user", {
      message: "The last turn must be the learner's",
    }),
  scenario: z.string().min(1).max(LIMITS.scenario),
  focus: z.array(z.string().min(1).max(LIMITS.focusItem)).max(LIMITS.focusItems),
  level: z.enum(["B1", "B2"]),
});
export type CoachBody = z.infer<typeof CoachBodySchema>;

/** Same rule as the client's deviceId(): a UUID or anything UUID-like, at most 64 chars. */
export const DeviceIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/);

/** A correction as the model returns it; anything that does not fit is dropped, not repaired. */
export const CorrectionSchema = z.object({
  wrong: z.string().trim().min(1).max(200),
  right: z.string().trim().min(1).max(200),
  why: z.string().trim().min(1).max(240),
});
export type Correction = z.infer<typeof CorrectionSchema>;

export const ReplyTextSchema = z.string().trim().min(1).max(2000);

export const ExplainResponseSchema = z.strictObject({
  text: z.string().min(1),
  cached: z.boolean(),
});

export const CoachResponseSchema = z.strictObject({
  reply: z.string().min(1),
  correction: z
    .strictObject({ wrong: z.string(), right: z.string(), why: z.string() })
    .nullable(),
  ended: z.boolean(),
});
export type CoachResponse = z.infer<typeof CoachResponseSchema>;
