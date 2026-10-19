import { CorrectionSchema, ReplyTextSchema, type Correction } from "./schemas";

/** Removes one surrounding ``` fence (with or without a language tag). */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = /^```[\w-]*[^\S\n]*\n?([\s\S]*?)\n?\s*```$/.exec(trimmed);
  return match ? (match[1] ?? "").trim() : trimmed;
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Finds a JSON object in model output: the whole text, or the outermost {...} inside it. */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const body = stripCodeFences(text);
  const candidates = [body];
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(body.slice(start, end + 1));
  for (const candidate of candidates) {
    const value = tryParse(candidate);
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

/** Pulls "reply" out of JSON that was cut off (e.g. max_tokens hit inside "correction"). */
function salvageReply(text: string): string | null {
  const match = /"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text);
  if (!match) return null;
  const value = tryParse(`"${match[1] ?? ""}"`);
  return typeof value === "string" ? value : null;
}

export interface CleanOptions {
  maxWords: number;
  /** Keep **bold** (explanations) or strip all markdown (spoken coach replies). */
  bold: boolean;
}

/** Cuts to maxWords, preferring to end on a sentence boundary. */
export function clampWords(text: string, maxWords: number): string {
  const words = text.split(" ").filter((word) => word.length > 0);
  if (words.length <= maxWords) return words.join(" ");
  const cut = words.slice(0, maxWords).join(" ");
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (lastStop > cut.length / 2) return cut.slice(0, lastStop + 1);
  return `${cut.replace(/[\s,;:–—-]+$/, "")}…`;
}

/** Normalizes model text into one short plain paragraph. */
export function cleanText(raw: string, options: CleanOptions): string {
  let text = stripCodeFences(raw).replace(/\r/g, "");
  // The whole answer wrapped in quotes (and no quotes inside): unwrap it.
  if (/^"[^"]*"$/.test(text)) text = text.slice(1, -1);
  text = text
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/^\s*(?:[-•]|\*(?!\*)|\d+[.)])\s+/gm, "")
    .replace(/`+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // Single-asterisk or underscore italics are never wanted. No lookbehind here: the app's
  // tsconfig (which also covers this file) targets ES2017, where TypeScript rejects it.
  text = text.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1$2").replace(/__([^_]+)__/g, "$1");
  if (options.bold) {
    const marks = text.split("**").length - 1;
    if (marks % 2 === 1) {
      const last = text.lastIndexOf("**");
      text = text.slice(0, last) + text.slice(last + 2);
    }
  } else {
    text = text.replace(/\*\*/g, "");
  }
  return clampWords(text, options.maxWords);
}

export interface CoachOutput {
  reply: string;
  correction: Correction | null;
}

const REPLY_MAX_WORDS = 80;
const WHY_MAX_WORDS = 25;

function cleanCorrection(value: unknown): Correction | null {
  const parsed = CorrectionSchema.safeParse(value);
  if (!parsed.success) return null;
  const why = cleanText(parsed.data.why, { maxWords: WHY_MAX_WORDS, bold: false });
  const wrong = cleanText(parsed.data.wrong, { maxWords: 40, bold: false });
  const right = cleanText(parsed.data.right, { maxWords: 40, bold: false });
  if (!why || !wrong || !right) return null;
  return { wrong, right, why };
}

/**
 * Model output → { reply, correction }. Accepts clean JSON, fenced JSON, JSON with chatter
 * around it, truncated JSON (reply salvaged, correction dropped) and plain text (reply only).
 * Returns null when there is nothing usable to say.
 */
export function parseCoachOutput(raw: string): CoachOutput | null {
  const text = stripCodeFences(raw);
  if (!text) return null;
  const json = extractJsonObject(text);
  if (json) {
    const reply = ReplyTextSchema.safeParse(json.reply);
    if (!reply.success) return null;
    const cleaned = cleanText(reply.data, { maxWords: REPLY_MAX_WORDS, bold: false });
    return cleaned ? { reply: cleaned, correction: cleanCorrection(json.correction) } : null;
  }
  if (text.startsWith("{")) {
    const salvaged = salvageReply(text);
    const cleaned = salvaged ? cleanText(salvaged, { maxWords: REPLY_MAX_WORDS, bold: false }) : "";
    return cleaned ? { reply: cleaned, correction: null } : null;
  }
  const cleaned = cleanText(text, { maxWords: REPLY_MAX_WORDS, bold: false });
  return cleaned ? { reply: cleaned, correction: null } : null;
}

/** Lowercase words only, for loose comparison of speech-recognized text. */
export function looseWords(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9'À-ɏЀ-ӿ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Keeps a correction only if it is about what the learner actually said and changes something:
 * models sometimes "correct" a sentence that was fine, or quote words the learner never used.
 */
export function correctionFits(correction: Correction, lastUserText: string): boolean {
  const wrong = looseWords(correction.wrong);
  const right = looseWords(correction.right);
  if (!wrong || wrong === right) return false;
  const said = ` ${looseWords(lastUserText)} `;
  if (said.includes(` ${wrong} `)) return true;
  const saidWords = new Set(said.trim().split(" "));
  return wrong.split(" ").every((word) => saidWords.has(word));
}
