import { z } from "zod";
import { sha256Hex } from "./cache";
import type { KvLike } from "./env";
import { KV_PREFIX, kvGetJson } from "./kv";
import { cleanText, extractJsonObject, stripCodeFences } from "./parse";
import { NOTE_MAX_WORDS, type TranslateDirection } from "./prompts";
import {
  LIMITS,
  TranslateNoteSchema,
  TranslateResponseSchema,
  type TranslateNote,
  type TranslateTarget,
} from "./schemas";

const TRANSLATION_MAX_CHARS = 2400;

/** More Cyrillic letters than Latin ones. */
export function isMainlyCyrillic(text: string): boolean {
  const cyrillic = (text.match(/[Ѐ-ӿ]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return cyrillic > latin;
}

/** "auto": Russian → English when the text is mainly Cyrillic, otherwise English → Russian. */
export function translationDirection(text: string, to: TranslateTarget): TranslateDirection {
  const target = to === "auto" ? (isMainlyCyrillic(text) ? "en" : "ru") : to;
  return { from: target === "ru" ? "en" : "ru", to: target };
}

export async function translateCacheKey(to: TranslateTarget, text: string): Promise<string> {
  return `${KV_PREFIX.translate}${await sha256Hex(`${to}|${text}`)}`;
}

/** Trims, keeps line breaks, unwraps one pair of quotes around the whole answer. */
export function cleanTranslation(raw: string): string {
  let text = stripCodeFences(raw)
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (/^"[^"]*"$/.test(text) || /^«[^«»]*»$/.test(text)) text = text.slice(1, -1).trim();
  return text.slice(0, TRANSLATION_MAX_CHARS);
}

function looseWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[’‘`]/g, "'")
    .split(/[^a-z0-9'Ѐ-ӿ]+/)
    .filter((word) => word.length > 0);
}

/**
 * The phrase must come from the source: every word of 3+ letters has its stem (first 4 letters)
 * inside some source word, so "carry out" fits "carried out" and "тратить" fits "потратил".
 */
export function noteFitsSource(phrase: string, source: string): boolean {
  const words = looseWords(phrase);
  const sourceWords = looseWords(source);
  if (words.length === 0) return false;
  const significant = words.filter((word) => word.length >= 3);
  if (significant.length === 0) return ` ${sourceWords.join(" ")} `.includes(` ${words.join(" ")} `);
  return significant.every((word) => {
    const stem = word.slice(0, 4);
    return sourceWords.some((candidate) => candidate.includes(stem));
  });
}

function cleanNotes(value: unknown, source: string): TranslateNote[] {
  if (!Array.isArray(value)) return [];
  const notes: TranslateNote[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const parsed = TranslateNoteSchema.safeParse(item);
    if (!parsed.success) continue;
    const phrase = cleanText(parsed.data.phrase, { maxWords: 12, bold: false });
    const meaning = cleanText(parsed.data.meaning, { maxWords: NOTE_MAX_WORDS + 8, bold: false });
    const key = phrase.toLowerCase();
    if (!phrase || !meaning || seen.has(key) || !noteFitsSource(phrase, source)) continue;
    seen.add(key);
    notes.push({ phrase, meaning });
    if (notes.length === LIMITS.noteItems) break;
  }
  return notes;
}

/** Pulls "translation" out of JSON that was cut off by max_tokens. */
function salvageTranslation(text: string): string | null {
  const match = /"translation"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text);
  if (!match) return null;
  try {
    const value = JSON.parse(`"${match[1] ?? ""}"`) as unknown;
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

export interface TranslateOutput {
  translation: string;
  notes: TranslateNote[];
}

/**
 * Model output → { translation, notes }. Accepts clean, fenced or chatty JSON, truncated JSON
 * (translation salvaged, notes dropped) and plain text (translation only). Null when empty.
 */
export function parseTranslateOutput(raw: string, source: string): TranslateOutput | null {
  const text = stripCodeFences(raw);
  if (!text) return null;
  const json = extractJsonObject(text);
  if (json) {
    if (typeof json.translation !== "string") return null;
    const translation = cleanTranslation(json.translation);
    return translation ? { translation, notes: cleanNotes(json.notes, source) } : null;
  }
  if (text.startsWith("{")) {
    const salvaged = salvageTranslation(text);
    const translation = salvaged ? cleanTranslation(salvaged) : "";
    return translation ? { translation, notes: [] } : null;
  }
  const translation = cleanTranslation(text);
  return translation ? { translation, notes: [] } : null;
}

const CachedTranslationSchema = TranslateResponseSchema.extend({ model: z.string().min(1) });
export type CachedTranslation = z.infer<typeof CachedTranslationSchema>;

export async function readCachedTranslation(kv: KvLike | undefined, key: string): Promise<CachedTranslation | null> {
  const parsed = CachedTranslationSchema.safeParse(await kvGetJson(kv, key));
  return parsed.success ? parsed.data : null;
}
