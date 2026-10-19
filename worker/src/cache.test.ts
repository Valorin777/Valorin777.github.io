import { describe, expect, it } from "vitest";
import {
  EXPLAIN_TTL_SECONDS,
  explainCacheHash,
  explainCacheRequest,
  normalizeAnswer,
  readExplainCache,
  sha256Hex,
  writeExplainCache,
} from "./cache";
import type { CacheLike } from "./env";

class MemoryCache implements CacheLike {
  readonly store = new Map<string, { body: string; cacheControl: string | null }>();

  async match(request: Request): Promise<Response | undefined> {
    const entry = this.store.get(request.url);
    return entry ? new Response(entry.body) : undefined;
  }

  async put(request: Request, response: Response): Promise<void> {
    this.store.set(request.url, { body: await response.text(), cacheControl: response.headers.get("Cache-Control") });
  }
}

describe("normalizeAnswer", () => {
  it("ignores case, spacing, curly quotes and final punctuation", () => {
    expect(normalizeAnswer("  I’m   KNEW it. ")).toBe("i'm knew it");
    expect(normalizeAnswer("is started!?")).toBe("is started");
  });
});

describe("sha256Hex", () => {
  it("matches the known test vector", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("explainCacheHash", () => {
  it("is the same for answers that only differ in form", async () => {
    const a = await explainCacheHash("m", "d1-01", "Is started.", "en");
    const b = await explainCacheHash("m", "d1-01", "is   started", "en");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes with model, exercise, answer and language", async () => {
    const base = await explainCacheHash("m", "d1-01", "is started", "en");
    expect(await explainCacheHash("m2", "d1-01", "is started", "en")).not.toBe(base);
    expect(await explainCacheHash("m", "d1-02", "is started", "en")).not.toBe(base);
    expect(await explainCacheHash("m", "d1-01", "was started", "en")).not.toBe(base);
    expect(await explainCacheHash("m", "d1-01", "is started", "ru")).not.toBe(base);
  });
});

describe("explain cache", () => {
  it("keys on the worker's own host with a GET request", () => {
    const key = explainCacheRequest("https://ai.example.dev/explain?x=1", "abc");
    expect(key.url).toBe("https://ai.example.dev/__cache/explain/abc");
    expect(key.method).toBe("GET");
  });

  it("round-trips text with a 30-day TTL", async () => {
    const cache = new MemoryCache();
    const key = explainCacheRequest("https://ai.example.dev/explain", "abc");
    expect(await readExplainCache(cache, key)).toBeNull();
    await writeExplainCache(cache, key, "Use **started**.");
    expect(await readExplainCache(cache, key)).toBe("Use **started**.");
    expect(cache.store.get(key.url)?.cacheControl).toBe(`public, max-age=${EXPLAIN_TTL_SECONDS}`);
    expect(EXPLAIN_TTL_SECONDS).toBe(2_592_000);
  });

  it("treats a missing or broken cache as a miss", async () => {
    const key = explainCacheRequest("https://ai.example.dev/explain", "abc");
    expect(await readExplainCache(null, key)).toBeNull();
    const broken: CacheLike = {
      match: async () => {
        throw new Error("boom");
      },
      put: async () => {
        throw new Error("boom");
      },
    };
    expect(await readExplainCache(broken, key)).toBeNull();
    await expect(writeExplainCache(broken, key, "x")).resolves.toBeUndefined();
    const junk: CacheLike = { match: async () => new Response("not json"), put: async () => undefined };
    expect(await readExplainCache(junk, key)).toBeNull();
  });
});
