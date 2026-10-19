import type { KvLike } from "./env";

/** One namespace (TTS_CACHE) holds everything; the prefix tells the kinds apart. */
export const KV_PREFIX = { tts: "tts:", translate: "tr:", explain: "ex:" } as const;

export const DAY_SECONDS = 24 * 60 * 60;
/** Answers from the primary model live 30 days; fallback answers are replaced sooner. */
export const ANSWER_TTL_SECONDS = 30 * DAY_SECONDS;
export const FALLBACK_ANSWER_TTL_SECONDS = 3 * DAY_SECONDS;

// KV failures are never fatal: a miss only costs one model call, a failed write is retried next time.

export async function kvGetBytes(kv: KvLike | undefined, key: string): Promise<Uint8Array | null> {
  if (!kv) return null;
  try {
    const value = await kv.get(key, "arrayBuffer");
    return value && value.byteLength > 0 ? new Uint8Array(value) : null;
  } catch {
    return null;
  }
}

export async function kvGetJson(kv: KvLike | undefined, key: string): Promise<unknown> {
  if (!kv) return null;
  try {
    const value = await kv.get(key, "text");
    return value ? (JSON.parse(value) as unknown) : null;
  } catch {
    return null;
  }
}

/** ttlSeconds undefined = keep forever (audio for a fixed voice + text never changes). */
export async function kvPut(
  kv: KvLike | undefined,
  key: string,
  value: string | Uint8Array,
  ttlSeconds?: number,
): Promise<void> {
  if (!kv) return;
  try {
    // slice() copies, so the buffer holds exactly these bytes even for a view into a larger one.
    const body: string | ArrayBuffer = typeof value === "string" ? value : (value.slice().buffer as ArrayBuffer);
    await kv.put(key, body, ttlSeconds === undefined ? undefined : { expirationTtl: ttlSeconds });
  } catch {
    // See above.
  }
}
