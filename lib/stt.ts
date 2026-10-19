/**
 * Server speech recognition (the worker's /stt). Used by lib/speech.ts when the browser has no
 * Web Speech recognition or cannot reach Google's (Chrome sends audio there; often blocked in Russia).
 */

import { AiError, aiEnabled, aiRequest, isOffline } from "@/lib/ai";

/** The worker rejects bigger uploads with 413. */
export const STT_MAX_BYTES = 1_500_000;
export const STT_TIMEOUT_MS = 20_000;

export type SttContentType = "audio/webm" | "audio/mp4" | "audio/ogg" | "audio/wav";

/** MediaRecorder / Blob type ("audio/webm;codecs=opus") → the bare type the worker accepts. */
export function sttContentType(mime: string): SttContentType | null {
  const base = (mime || "").split(";")[0]?.trim().toLowerCase() ?? "";
  switch (base) {
    case "audio/webm":
    case "video/webm":
      return "audio/webm";
    case "audio/mp4":
    case "video/mp4":
    case "audio/x-m4a":
    case "audio/m4a":
      return "audio/mp4";
    case "audio/ogg":
    case "application/ogg":
      return "audio/ogg";
    case "audio/wav":
    case "audio/wave":
    case "audio/x-wav":
    case "audio/vnd.wave":
      return "audio/wav";
    default:
      return null;
  }
}

export function parseSttResponse(data: unknown): string | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const text = (data as { text?: unknown }).text;
  return typeof text === "string" ? text.replace(/\s+/g, " ").trim() : null;
}

/**
 * The words in a recording ("" when nothing was said). Rejects with AiError, or with the
 * caller's abort reason.
 */
export async function transcribe(blob: Blob, lang: "en" | "ru", signal?: AbortSignal): Promise<string> {
  if (!aiEnabled()) throw new AiError("disabled");
  const type = sttContentType(blob.type);
  if (!type) throw new AiError("unavailable", `Unsupported audio type "${blob.type}"`);
  if (blob.size === 0) return "";
  if (blob.size > STT_MAX_BYTES) throw new AiError("unavailable", "Recording too long");
  if (isOffline(typeof navigator === "undefined" ? undefined : navigator)) throw new AiError("offline");
  const data = await aiRequest(
    "/stt",
    { body: blob, contentType: type, query: { lang }, timeoutMs: STT_TIMEOUT_MS, signal },
    (response) => response.json() as Promise<unknown>,
  );
  const text = parseSttResponse(data);
  if (text === null) throw new AiError("unavailable", "Unexpected AI response");
  return text;
}
