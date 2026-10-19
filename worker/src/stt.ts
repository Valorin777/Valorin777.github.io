import { bytesToBase64 } from "./audio";
import type { AiBinding } from "./env";
import { UpstreamError } from "./openrouter";
import type { Lang } from "./schemas";
import { runAi } from "./workersai";

export const WHISPER_TURBO = "@cf/openai/whisper-large-v3-turbo";
export const WHISPER = "@cf/openai/whisper";
export const STT_MAX_BYTES = 1.5 * 1024 * 1024;
export const STT_CONTENT_TYPES = ["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/wav"] as const;
const TRANSCRIPT_MAX_CHARS = 2000;

/** "audio/webm;codecs=opus" → "audio/webm"; null when it is not one of the accepted types. */
export function sttContentType(header: string | null): string | null {
  const base = (header ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return (STT_CONTENT_TYPES as readonly string[]).includes(base) ? base : null;
}

// Whisper's well-known inventions on silence or noise (from subtitle training data).
const HALLUCINATIONS = new Set([
  "thank you",
  "thank you very much",
  "thanks for watching",
  "thank you for watching",
  "you",
  "продолжение следует",
  "субтитры сделал dimatorzok",
  "субтитры создавал dimatorzok",
  "редактор субтитров а.семкин корректор а.егорова",
  "спасибо за просмотр",
]);

export function cleanTranscript(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const key = flat.toLowerCase().replace(/[.!?…,]+/g, "").trim();
  if (HALLUCINATIONS.has(key)) return "";
  return flat.slice(0, TRANSCRIPT_MAX_CHARS);
}

function transcriptText(output: unknown): string | null {
  if (output === null || typeof output !== "object") return null;
  const text = (output as { text?: unknown }).text;
  return typeof text === "string" ? text : null;
}

export interface Transcript {
  text: string;
  model: string;
}

/** whisper-large-v3-turbo (base64 + language), then classic whisper (byte array, auto language). */
export async function transcribe(
  ai: AiBinding | undefined,
  audio: Uint8Array,
  lang: Lang,
  timeoutMs?: number,
): Promise<Transcript> {
  try {
    const output = await runAi(
      ai,
      WHISPER_TURBO,
      { audio: bytesToBase64(audio), language: lang, task: "transcribe", vad_filter: true },
      timeoutMs,
    );
    const text = transcriptText(output);
    if (text === null) throw new UpstreamError("empty");
    return { text: cleanTranscript(text), model: WHISPER_TURBO };
  } catch (error) {
    if (!(error instanceof UpstreamError)) throw error;
    console.warn(`whisper turbo failed: ${error.reason}${error.status === null ? "" : ` ${error.status}`}`);
  }
  const output = await runAi(ai, WHISPER, { audio: Array.from(audio) }, timeoutMs);
  const text = transcriptText(output);
  if (text === null) throw new UpstreamError("empty");
  return { text: cleanTranscript(text), model: WHISPER };
}
