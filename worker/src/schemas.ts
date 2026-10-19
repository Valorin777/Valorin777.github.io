import { z } from "zod";
import { oneLine } from "./prompts";
import { VOICE_IDS } from "./voices";

export const LIMITS = {
  exerciseId: 80,
  task: 400,
  given: 200,
  right: 200,
  rule: 160,
  category: 40,
  turnText: 400,
  historyMax: 30,
  scenario: 60,
  focusItems: 6,
  focusItem: 40,
  bodyBytes: 16 * 1024,
  ttsText: 300,
  translateText: 600,
  noteItems: 3,
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
  /** Titles of tips already shown in this conversation, so the examiner never repeats one. */
  tipsSeen: z.array(z.string().min(1).max(80)).max(20).optional(),
  /** Corrections already made in this conversation (oldest first), for consistency and repeats. */
  ledger: z
    .array(z.strictObject({ wrong: z.string().min(1).max(200), right: z.string().min(1).max(200) }))
    .max(20)
    .optional(),
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

/** A short "tense trick" the coach adds to every turn (shown as a card, not read aloud). */
export const TipSchema = z.object({
  title: z.string().trim().min(1).max(80),
  text: z.string().trim().min(1).max(600),
  ru: z.string().trim().max(600).nullish().transform((v) => v ?? undefined),
  // Models sometimes give more examples or a single string: keep the first three.
  examples: z
    .union([z.array(z.string()), z.string()])
    .transform((v) => (Array.isArray(v) ? v : [v]).map((x) => x.trim()).filter((x) => x.length > 0 && x.length <= 200).slice(0, 3))
    .optional(),
});
export interface Tip {
  title: string;
  text: string;
  ru?: string;
  examples?: string[];
}

export const ExplainResponseSchema = z.strictObject({
  text: z.string().min(1),
  cached: z.boolean(),
});

export const CoachResponseSchema = z.strictObject({
  reply: z.string().min(1),
  correction: z
    .strictObject({ wrong: z.string(), right: z.string(), why: z.string() })
    .nullable(),
  tip: z
    .strictObject({ title: z.string(), text: z.string(), ru: z.string().optional(), examples: z.array(z.string()).optional() })
    .nullable(),
  ended: z.boolean(),
});
export type CoachResponse = z.infer<typeof CoachResponseSchema>;

/** Speech is one line: whitespace and control characters collapse before the length check. */
export const TtsBodySchema = z.strictObject({
  text: z
    .string()
    .max(LIMITS.ttsText * 4)
    .transform((text) => oneLine(text.normalize("NFKC")))
    .pipe(z.string().min(1).max(LIMITS.ttsText)),
  voice: z.enum(VOICE_IDS),
});
export type TtsBody = z.infer<typeof TtsBodySchema>;

/** Keeps line breaks (a short dialogue stays readable) but nothing else unusual. */
export function normalizeSourceText(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFKC").replace(/\r\n?/g, "\n")) {
    const code = ch.charCodeAt(0);
    out += ch === "\n" || (code >= 32 && code !== 127) ? ch : " ";
  }
  return out
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const TranslateTargetSchema = z.enum(["ru", "en", "auto"]);
export type TranslateTarget = z.infer<typeof TranslateTargetSchema>;

export const TranslateBodySchema = z.strictObject({
  text: z
    .string()
    .max(LIMITS.translateText * 4)
    .transform(normalizeSourceText)
    .pipe(z.string().min(1).max(LIMITS.translateText)),
  to: TranslateTargetSchema,
});
export type TranslateBody = z.infer<typeof TranslateBodySchema>;

/** A note as the model returns it; anything that does not fit is dropped. */
export const TranslateNoteSchema = z.object({
  phrase: z.string().trim().min(1).max(80),
  meaning: z.string().trim().min(1).max(200),
});
export type TranslateNote = z.infer<typeof TranslateNoteSchema>;

export const TranslateResponseSchema = z.strictObject({
  translation: z.string().min(1),
  from: LangSchema,
  notes: z.array(z.strictObject({ phrase: z.string().min(1), meaning: z.string().min(1) })).max(LIMITS.noteItems),
});
export type TranslateResponse = z.infer<typeof TranslateResponseSchema>;

export const VoicesResponseSchema = z.strictObject({
  voices: z
    .array(
      z.strictObject({
        id: z.enum(VOICE_IDS),
        label: z.string().min(1),
        accent: z.enum(["US", "UK", "AU", "IE"]),
        gender: z.enum(["female", "male"]),
        model: z.string().min(1),
      }),
    )
    .min(1),
  default: z.enum(VOICE_IDS),
});

export const SttResponseSchema = z.strictObject({ text: z.string() });
