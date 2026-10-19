import { audioBytes, sniffAudioType, type AudioType } from "./audio";
import { sha256Hex } from "./cache";
import type { Deps, Env } from "./env";
import { KV_PREFIX, kvGetBytes, kvPut } from "./kv";
import { UpstreamError } from "./openrouter";
import { oneLine } from "./prompts";
import { openAiSpeech } from "./openaiTts";
import { FREE_FALLBACK_VOICE, MELOTTS, OPENAI_TTS_MODEL, voiceSpec, type VoiceId } from "./voices";
import { runAi } from "./workersai";

/** Cache "voice" for MeloTTS output, so the real voice replaces it once Aura works again. */
export const MELO_VOICE = "melo";

export interface Speech {
  bytes: Uint8Array;
  contentType: AudioType;
  /** The model that made the audio (X-TTS-Model). */
  model: string;
  /** true when the robotic MeloTTS fallback was used. */
  fallback: boolean;
  cached: boolean;
}

/** One line, compatibility forms folded, so equal sentences share one cache entry. */
export function normalizeTtsText(text: string): string {
  return oneLine(text.normalize("NFKC"));
}

export async function ttsCacheKey(voice: string, text: string): Promise<string> {
  return `${KV_PREFIX.tts}${await sha256Hex(`${voice}|${text}`)}`;
}

async function toSpeech(output: unknown): Promise<{ bytes: Uint8Array; contentType: AudioType }> {
  const bytes = await audioBytes(output);
  const contentType = bytes ? sniffAudioType(bytes) : null;
  if (!bytes || !contentType) throw new UpstreamError("empty");
  return { bytes, contentType };
}

async function cachedSpeech(env: Pick<Env, "TTS_CACHE">, key: string, model: string, fallback: boolean): Promise<Speech | null> {
  const bytes = await kvGetBytes(env.TTS_CACHE, key);
  const contentType = bytes ? sniffAudioType(bytes) : null;
  return bytes && contentType ? { bytes, contentType, model, fallback, cached: true } : null;
}

/**
 * KV hit → bytes. Miss → Aura (stored forever under tts:sha256(voice|text)). Any Aura error
 * (e.g. 4006, the daily free allocation is used up) → MeloTTS, stored under the "melo" key
 * only. Throws UpstreamError when both fail.
 */
export async function synthesize(
  env: Pick<Env, "AI" | "TTS_CACHE" | "OPENROUTER_API_KEY">,
  deps: Pick<Deps, "waitUntil" | "aiTimeoutMs" | "fetch">,
  voice: VoiceId,
  text: string,
): Promise<Speech> {
  const { model, speaker } = voiceSpec(voice);
  const key = await ttsCacheKey(voice, text);
  const hit = await cachedSpeech(env, key, model, false);
  if (hit) return hit;

  if (model === OPENAI_TTS_MODEL) {
    try {
      // One retry: a second take usually reads the line when the first one answered it.
      const bytes = await openAiSpeech(env, deps.fetch, speaker, text).catch(() => openAiSpeech(env, deps.fetch, speaker, text));
      deps.waitUntil(kvPut(env.TTS_CACHE, key, bytes));
      return { bytes, contentType: "audio/wav", model, fallback: false, cached: false };
    } catch (error) {
      if (!(error instanceof UpstreamError)) throw error;
      console.warn(`openai voice failed: ${error.reason}${error.status === null ? "" : ` ${error.status}`}; using ${FREE_FALLBACK_VOICE}`);
      const free = await synthesize(env, deps, FREE_FALLBACK_VOICE, text);
      return { ...free, fallback: true };
    }
  }

  try {
    const output = await runAi(env.AI, model, { text, speaker, encoding: "mp3" }, deps.aiTimeoutMs);
    const speech = await toSpeech(output);
    deps.waitUntil(kvPut(env.TTS_CACHE, key, speech.bytes));
    return { ...speech, model, fallback: false, cached: false };
  } catch (error) {
    if (!(error instanceof UpstreamError)) throw error;
    console.warn(`aura failed: ${error.reason}${error.status === null ? "" : ` ${error.status}`}; using melotts`);
  }

  const meloKey = await ttsCacheKey(MELO_VOICE, text);
  const meloHit = await cachedSpeech(env, meloKey, MELOTTS, true);
  if (meloHit) return meloHit;
  const output = await runAi(env.AI, MELOTTS, { prompt: text, lang: "en" }, deps.aiTimeoutMs);
  const speech = await toSpeech(output);
  deps.waitUntil(kvPut(env.TTS_CACHE, meloKey, speech.bytes));
  return { ...speech, model: MELOTTS, fallback: true, cached: false };
}
