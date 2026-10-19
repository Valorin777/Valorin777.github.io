import type { CacheLike } from "./env";
import type { Lang } from "./schemas";

export const EXPLAIN_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Answers that differ only in case, spacing, curly quotes or final punctuation share a cache entry. */
export function normalizeAnswer(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?…]+$/, "")
    .trim();
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function explainCacheHash(model: string, exerciseId: string, given: string, lang: Lang): Promise<string> {
  return sha256Hex([model, exerciseId, normalizeAnswer(given), lang].join("\u001f"));
}

/** Cache API keys must be GET requests; the worker's own hostname keeps them in its zone. */
export function explainCacheRequest(requestUrl: string, hash: string): Request {
  return new Request(new URL(`/__cache/explain/${hash}`, requestUrl).toString(), { method: "GET" });
}

/** Cache failures are never fatal: a miss just costs one model call. */
export async function readExplainCache(cache: CacheLike | null, key: Request): Promise<string | null> {
  if (!cache) return null;
  try {
    const hit = await cache.match(key);
    if (!hit) return null;
    const data = (await hit.json()) as unknown;
    if (data !== null && typeof data === "object") {
      const text = (data as { text?: unknown }).text;
      if (typeof text === "string" && text.length > 0) return text;
    }
    return null;
  } catch {
    return null;
  }
}

export async function writeExplainCache(cache: CacheLike | null, key: Request, text: string): Promise<void> {
  if (!cache) return;
  try {
    await cache.put(
      key,
      new Response(JSON.stringify({ text }), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": `public, max-age=${EXPLAIN_TTL_SECONDS}`,
        },
      }),
    );
  } catch {
    // Ignored on purpose; see readExplainCache.
  }
}
