import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AI_LIMITS,
  AiError,
  CACHE_PREFIX,
  FALLBACK_VOICES,
  TRANSLATE_CACHE_MAX_ENTRIES,
  TRANSLATE_CACHE_PREFIX,
  VOICES_KEY,
  aiEnabled,
  buildUrl,
  clampCoachInput,
  clampExplainInput,
  coach,
  detectLang,
  errorKindForFailure,
  errorKindForStatus,
  explain,
  explainCacheKey,
  fallbackUuid,
  fetchVoices,
  isDeviceId,
  isOffline,
  newDeviceId,
  normalizeGiven,
  normalizeTranslateText,
  parseCoachResponse,
  parseExplainResponse,
  parseTranslateResponse,
  parseVoicesResponse,
  readCachedExplain,
  selectEvictions,
  smallHash,
  translate,
  translateCacheKey,
  trimBaseUrl,
  writeCachedExplain,
  type ExplainInput,
  type StorageLike,
} from "@/lib/ai";

class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}

const input: ExplainInput = {
  exerciseId: "d1-be-03",
  task: "Yesterday the meeting ___ at nine.",
  given: "is started",
  right: "started",
  rule: "Past simple: no be",
  category: "be-verb",
  lang: "en",
};

const coachInput = {
  history: [
    { role: "assistant" as const, text: "What did you do at the weekend?" },
    { role: "user" as const, text: "i am went to the park" },
  ],
  scenario: "Weekend small talk",
  focus: ["extra be"],
  level: "B1" as const,
};

describe("URLs", () => {
  it("trims trailing slashes and joins paths", () => {
    expect(trimBaseUrl(" https://ai.example.dev/// ")).toBe("https://ai.example.dev");
    expect(buildUrl("https://ai.example.dev/", "/explain")).toBe("https://ai.example.dev/explain");
    expect(buildUrl("http://localhost:8787", "/coach")).toBe("http://localhost:8787/coach");
  });
});

describe("disabled without NEXT_PUBLIC_AI_URL", () => {
  it("reports disabled and rejects calls", async () => {
    expect(aiEnabled()).toBe(false);
    await expect(explain(input)).rejects.toMatchObject({ kind: "disabled" });
    await expect(coach(coachInput)).rejects.toBeInstanceOf(AiError);
  });
});

describe("error mapping", () => {
  it("maps statuses and failures to error kinds", () => {
    expect(errorKindForStatus(429)).toBe("rate-limit");
    expect(errorKindForStatus(502)).toBe("unavailable");
    expect(errorKindForStatus(400)).toBe("unavailable");
    expect(errorKindForFailure({ timedOut: true, offline: true })).toBe("timeout");
    expect(errorKindForFailure({ timedOut: false, offline: true })).toBe("offline");
    expect(errorKindForFailure({ timedOut: false, offline: false })).toBe("unavailable");
  });

  it("treats only an explicit onLine=false as offline", () => {
    expect(isOffline({ onLine: false })).toBe(true);
    expect(isOffline({ onLine: true })).toBe(false);
    expect(isOffline({})).toBe(false);
    expect(isOffline(undefined)).toBe(false);
  });

  it("AiError carries its kind", () => {
    const error = new AiError("timeout");
    expect(error).toBeInstanceOf(Error);
    expect(error.kind).toBe("timeout");
    expect(error.name).toBe("AiError");
  });
});

describe("cache key", () => {
  it("normalizes the learner's answer", () => {
    expect(normalizeGiven("  I’M   Knew. ")).toBe("i'm knew");
    expect(explainCacheKey({ ...input, given: "Is  started!" })).toBe(explainCacheKey(input));
  });

  it("differs by exercise, answer and language and uses the prefix", () => {
    const key = explainCacheKey(input);
    expect(key.startsWith(CACHE_PREFIX)).toBe(true);
    expect(key.length).toBeLessThan(CACHE_PREFIX.length + 13);
    expect(explainCacheKey({ ...input, lang: "ru" })).not.toBe(key);
    expect(explainCacheKey({ ...input, given: "was started" })).not.toBe(key);
    expect(explainCacheKey({ ...input, exerciseId: "d1-be-04" })).not.toBe(key);
  });

  it("smallHash is deterministic and spreads", () => {
    expect(smallHash("abc")).toBe(smallHash("abc"));
    const hashes = new Set(Array.from({ length: 1000 }, (_, i) => smallHash(`ex-${i}|answer|en`)));
    expect(hashes.size).toBe(1000);
  });
});

describe("local explanation cache", () => {
  it("evicts the least recently used entries", () => {
    expect(
      selectEvictions(
        [
          { key: "a", t: 3 },
          { key: "b", t: 1 },
          { key: "c", t: 2 },
        ],
        1,
      ),
    ).toEqual(["b", "c"]);
    expect(selectEvictions([{ key: "a", t: 1 }], 1)).toEqual([]);
  });

  it("round-trips, refreshes on read and keeps at most max entries", () => {
    const storage = new MemoryStorage();
    storage.setItem("b2sprint:state", "{}");
    const [a, b, c] = [`${CACHE_PREFIX}a`, `${CACHE_PREFIX}b`, `${CACHE_PREFIX}c`];
    writeCachedExplain(storage, a, "A", 1, 2);
    writeCachedExplain(storage, b, "B", 2, 2);
    expect(readCachedExplain(storage, a, 3)).toBe("A");
    writeCachedExplain(storage, c, "C", 4, 2);
    expect(storage.getItem(b)).toBeNull();
    expect(readCachedExplain(storage, a, 5)).toBe("A");
    expect(readCachedExplain(storage, c, 6)).toBe("C");
    expect(storage.getItem("b2sprint:state")).toBe("{}");
  });

  it("treats corrupt entries as misses and survives broken storage", () => {
    const storage = new MemoryStorage();
    storage.setItem(`${CACHE_PREFIX}x`, "not json");
    expect(readCachedExplain(storage, `${CACHE_PREFIX}x`, 1)).toBeNull();
    const broken: StorageLike = {
      length: 0,
      key: () => null,
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => undefined,
    };
    expect(readCachedExplain(broken, `${CACHE_PREFIX}x`, 1)).toBeNull();
    expect(() => writeCachedExplain(broken, `${CACHE_PREFIX}x`, "X", 1)).not.toThrow();
  });
});

describe("device id", () => {
  it("validates UUID-like ids", () => {
    expect(isDeviceId("3f2b8c1e-9d4a-4f6b-8e2c-1a2b3c4d5e6f")).toBe(true);
    expect(isDeviceId("short")).toBe(false);
    expect(isDeviceId("a".repeat(65))).toBe(false);
    expect(isDeviceId("has space-123456")).toBe(false);
  });

  it("builds a v4-shaped fallback from any random source", () => {
    let seed = 0;
    const id = fallbackUuid(() => (seed = (seed * 9301 + 49297) % 233280) / 233280);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(isDeviceId(id)).toBe(true);
    expect(fallbackUuid(() => 0.999999)).toMatch(/^f{8}-f{4}-4f{3}-bf{3}-f{12}$/);
  });

  it("prefers crypto.randomUUID", () => {
    expect(isDeviceId(newDeviceId())).toBe(true);
    expect(newDeviceId()).not.toBe(newDeviceId());
  });
});

describe("clamping to the worker's limits", () => {
  it("cuts explain fields", () => {
    const out = clampExplainInput({ ...input, task: "x".repeat(500), given: "y".repeat(300) });
    expect(out.task).toHaveLength(AI_LIMITS.task);
    expect(out.given).toHaveLength(AI_LIMITS.given);
    expect(out.right).toBe("started");
  });

  it("keeps the last 30 non-empty turns and trims focus", () => {
    const history = Array.from({ length: 34 }, (_, i) => ({
      role: i % 2 === 0 ? ("assistant" as const) : ("user" as const),
      text: i === 5 ? "   " : `turn ${i} ${"z".repeat(i === 33 ? 500 : 0)}`,
    }));
    const out = clampCoachInput({
      history,
      scenario: "s".repeat(80),
      focus: ["a", " ", "b".repeat(50), "c", "d", "e", "f", "g"],
      level: "B2",
    });
    expect(out.history).toHaveLength(30);
    expect(out.history[29]?.text).toHaveLength(AI_LIMITS.turnText);
    expect(out.history[0]?.text).toBe("turn 3");
    expect(out.scenario).toHaveLength(AI_LIMITS.scenario);
    expect(out.focus).toEqual(["a", "b".repeat(40), "c", "d", "e", "f"]);
  });
});

describe("response parsing", () => {
  it("accepts well-formed responses", () => {
    expect(parseExplainResponse({ text: "Use **started**.", cached: true })).toEqual({
      text: "Use **started**.",
      cached: true,
    });
    expect(
      parseCoachResponse({ reply: "Nice! Why?", correction: { wrong: "a", right: "b", why: "c" }, ended: false }),
    ).toEqual({ reply: "Nice! Why?", correction: { wrong: "a", right: "b", why: "c" }, tip: null, ended: false });
    expect(
      parseCoachResponse({
        reply: "Oh! Why?",
        correction: null,
        tip: { title: "Was + -ing", text: "In progress.", ru: "В процессе.", examples: ["✓ a", "✗ b", "✓ c", "✓ d"] },
        ended: false,
      })?.tip,
    ).toEqual({ title: "Was + -ing", text: "In progress.", ru: "В процессе.", examples: ["✓ a", "✗ b", "✓ c"] });
  });

  it("rejects junk and drops a malformed correction", () => {
    expect(parseExplainResponse({ error: "upstream" })).toBeNull();
    expect(parseExplainResponse({ text: " " })).toBeNull();
    expect(parseCoachResponse(null)).toBeNull();
    expect(parseCoachResponse({ reply: "Hi", correction: { wrong: 1 } })).toEqual({
      reply: "Hi",
      correction: null,
      tip: null,
      ended: false,
    });
  });
});

describe("explain() and coach() against a stubbed worker", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function load(fetchImpl: (url: string, init: RequestInit) => Promise<Response>) {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_AI_URL", "https://ai.example.dev/");
    const storage = new MemoryStorage();
    vi.stubGlobal("window", { localStorage: storage });
    const fetchMock = vi.fn(fetchImpl);
    vi.stubGlobal("fetch", fetchMock);
    const mod = await import("@/lib/ai");
    return { mod, storage, fetchMock };
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  it("posts to the worker with a device id, then serves the answer from localStorage", async () => {
    const { mod, storage, fetchMock } = await load(async () => json({ text: "No **be** here.", cached: false }));
    expect(mod.aiEnabled()).toBe(true);
    expect(await mod.explain(input)).toEqual({ text: "No **be** here.", cached: false });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ai.example.dev/explain");
    const headers = init.headers as Record<string, string>;
    expect(isDeviceId(headers["X-Device-Id"] ?? "")).toBe(true);
    expect(storage.getItem("b2sprint:device")).toBe(headers["X-Device-Id"]);
    expect(JSON.parse(String(init.body))).toEqual(input);

    expect(await mod.explain({ ...input, given: "Is started." })).toEqual({ text: "No **be** here.", cached: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps 429, other statuses, network errors and bad bodies", async () => {
    const statuses = await load(async () => json({ error: "rate-limit" }, 429));
    await expect(statuses.mod.coach(coachInput)).rejects.toMatchObject({ kind: "rate-limit" });

    const server = await load(async () => json({ error: "upstream" }, 502));
    await expect(server.mod.coach(coachInput)).rejects.toMatchObject({ kind: "unavailable" });

    const network = await load(async () => Promise.reject(new TypeError("Failed to fetch")));
    await expect(network.mod.explain(input)).rejects.toMatchObject({ kind: "unavailable" });

    const junk = await load(async () => json({ nope: true }));
    await expect(junk.mod.coach(coachInput)).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("fails fast when offline, but still answers from the cache", async () => {
    const { mod, storage, fetchMock } = await load(async () => json({ text: "x", cached: false }));
    storage.setItem(mod.explainCacheKey(input), JSON.stringify({ t: 1, text: "Cached." }));
    vi.stubGlobal("navigator", { onLine: false });
    expect(await mod.explain(input)).toEqual({ text: "Cached.", cached: true });
    await expect(mod.explain({ ...input, given: "was started" })).rejects.toMatchObject({ kind: "offline" });
    await expect(mod.coach(coachInput)).rejects.toMatchObject({ kind: "offline" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("times out after 20 s for the coach", async () => {
    vi.useFakeTimers();
    const { mod } = await load(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const assertion = expect(mod.coach(coachInput)).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
  });

  it("rethrows the caller's abort instead of an AiError", async () => {
    const { mod } = await load(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const controller = new AbortController();
    const pending = mod.coach(coachInput, controller.signal);
    controller.abort();
    const error: unknown = await pending.catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(mod.AiError);
    expect((error as { name?: string }).name).toBe("AbortError");
  });
});

describe("translation helpers", () => {
  it("keys the cache by target and normalized text", () => {
    const key = translateCacheKey({ text: "I’ve  been waiting", to: "ru" });
    expect(key.startsWith(TRANSLATE_CACHE_PREFIX)).toBe(true);
    expect(translateCacheKey({ text: " I've been\nwaiting ", to: "ru" })).toBe(key);
    expect(translateCacheKey({ text: "I've been waiting", to: "auto" })).not.toBe(key);
    expect(translateCacheKey({ text: "I've been waiting?", to: "ru" })).not.toBe(key);
    expect(normalizeTranslateText("  a  b ")).toBe("a b");
  });

  it("parses results, filters notes and falls back on the detected language", () => {
    expect(
      parseTranslateResponse({
        translation: "Не трать деньги впустую.",
        from: "en",
        notes: [{ phrase: "waste money", meaning: "тратить впустую" }, { phrase: 1 }, { phrase: " ", meaning: "x" }],
      }),
    ).toEqual({
      translation: "Не трать деньги впустую.",
      from: "en",
      notes: [{ phrase: "waste money", meaning: "тратить впустую" }],
    });
    expect(parseTranslateResponse({ translation: "Hello" }, "Привет")).toEqual({
      translation: "Hello",
      from: "ru",
      notes: [],
    });
    expect(parseTranslateResponse({ translation: " " })).toBeNull();
    expect(parseTranslateResponse({ error: "x" })).toBeNull();
    expect(detectLang("hello")).toBe("en");
    expect(detectLang("Ёлка")).toBe("ru");
  });
});

describe("voice list helpers", () => {
  it("keeps valid voices, drops junk and repairs a missing default", () => {
    expect(
      parseVoicesResponse({
        voices: [
          { id: "a1-luna", label: "Luna · US", accent: "US", gender: "female", model: "aura-1" },
          { id: "a1-luna", label: "dup", accent: "US", gender: "female" },
          { id: "bad id!", label: "x", accent: "US", gender: "male" },
          { id: "a1-orion", label: "", accent: "US", gender: "robot" },
          { id: "a1-helios", label: "Helios · UK", accent: "UK", gender: "male" },
        ],
        default: "gone",
      }),
    ).toEqual({
      voices: [
        { id: "a1-luna", label: "Luna · US", accent: "US", gender: "female" },
        { id: "a1-helios", label: "Helios · UK", accent: "UK", gender: "male" },
      ],
      default: "a1-luna",
    });
    expect(parseVoicesResponse({ voices: [] })).toBeNull();
    expect(parseVoicesResponse(null)).toBeNull();
  });

  it("ships the built-in fallback list", () => {
    expect(FALLBACK_VOICES.map((v) => v.id)).toEqual([
      "a1-asteria",
      "a1-luna",
      "a1-athena",
      "a1-helios",
      "a1-orion",
      "a1-arcas",
    ]);
    expect(FALLBACK_VOICES.find((v) => v.id === "a1-helios")).toEqual({
      id: "a1-helios",
      label: "Helios · UK",
      accent: "UK",
      gender: "male",
    });
  });
});

describe("translate() and fetchVoices() against a stubbed worker", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function load(fetchImpl: (url: string, init: RequestInit) => Promise<Response>, storage = new MemoryStorage()) {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_AI_URL", "https://ai.example.dev");
    vi.stubGlobal("window", { localStorage: storage });
    const fetchMock = vi.fn(fetchImpl);
    vi.stubGlobal("fetch", fetchMock);
    const mod = await import("@/lib/ai");
    return { mod, storage, fetchMock };
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  const translation = { translation: "Не трать деньги впустую.", from: "en", notes: [] };

  it("rejects when AI is off", async () => {
    await expect(translate({ text: "hi", to: "ru" })).rejects.toMatchObject({ kind: "disabled" });
    await expect(fetchVoices()).rejects.toMatchObject({ kind: "disabled" });
  });

  it("translate posts { text, to }, then answers from localStorage", async () => {
    const { mod, storage, fetchMock } = await load(async () => json(translation));
    const result = await mod.translate({ text: "  Don't waste   money. ", to: "auto" });
    expect(result).toEqual(translation);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ai.example.dev/translate");
    expect(JSON.parse(String(init.body))).toEqual({ text: "Don't waste money.", to: "auto" });
    expect(isDeviceId((init.headers as Record<string, string>)["X-Device-Id"] ?? "")).toBe(true);
    const keys = [...storage.map.keys()].filter((k) => k.startsWith(TRANSLATE_CACHE_PREFIX));
    expect(keys).toHaveLength(1);

    expect(await mod.translate({ text: "Don't waste money.", to: "auto" })).toEqual(translation);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await mod.translate({ text: "Don't waste money.", to: "ru" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("translate cuts long text and refuses empty text", async () => {
    const { mod, fetchMock } = await load(async () => json(translation));
    await mod.translate({ text: "x".repeat(900), to: "ru" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((JSON.parse(String(init.body)) as { text: string }).text).toHaveLength(AI_LIMITS.translateText);
    await expect(mod.translate({ text: "   ", to: "ru" })).rejects.toMatchObject({ kind: "unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("translate maps errors like explain and works offline from the cache", async () => {
    const limited = await load(async () => json({ error: "rate-limit" }, 429));
    await expect(limited.mod.translate({ text: "a", to: "ru" })).rejects.toMatchObject({ kind: "rate-limit" });
    const broken = await load(async () => json({ error: "upstream" }, 502));
    await expect(broken.mod.translate({ text: "a", to: "ru" })).rejects.toMatchObject({ kind: "unavailable" });
    const junk = await load(async () => json({ nope: true }));
    await expect(junk.mod.translate({ text: "a", to: "ru" })).rejects.toMatchObject({ kind: "unavailable" });

    const { mod, fetchMock } = await load(async () => json(translation));
    await mod.translate({ text: "Seen before", to: "ru" });
    vi.stubGlobal("navigator", { onLine: false });
    expect(await mod.translate({ text: "Seen before", to: "ru" })).toEqual(translation);
    await expect(mod.translate({ text: "New", to: "ru" })).rejects.toMatchObject({ kind: "offline" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("translate times out after 15 s", async () => {
    vi.useFakeTimers();
    const { mod } = await load(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const assertion = expect(mod.translate({ text: "a", to: "ru" })).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });

  it("translate cache is separate from the explanation cache and capped", async () => {
    const storage = new MemoryStorage();
    storage.setItem(`${CACHE_PREFIX}keep`, JSON.stringify({ t: 0, text: "explanation" }));
    for (let i = 0; i < TRANSLATE_CACHE_MAX_ENTRIES; i++) {
      storage.setItem(`${TRANSLATE_CACHE_PREFIX}old${i}`, JSON.stringify({ t: i + 1, text: "{}" }));
    }
    const { mod } = await load(async () => json(translation), storage);
    await mod.translate({ text: "one more", to: "ru" });
    const count = [...storage.map.keys()].filter((k) => k.startsWith(TRANSLATE_CACHE_PREFIX)).length;
    expect(count).toBe(TRANSLATE_CACHE_MAX_ENTRIES);
    expect(storage.getItem(`${TRANSLATE_CACHE_PREFIX}old0`)).toBeNull();
    expect(storage.getItem(`${CACHE_PREFIX}keep`)).not.toBeNull();
  });

  const voices = {
    voices: [
      { id: "a1-luna", label: "Luna · US", accent: "US", gender: "female", model: "aura-1" },
      { id: "a1-helios", label: "Helios · UK", accent: "UK", gender: "male", model: "aura-1" },
    ],
    default: "a1-helios",
  };

  it("fetchVoices GETs without custom headers and caches for a day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T10:00:00Z"));
    const { mod, storage, fetchMock } = await load(async () => json(voices));
    const list = await mod.fetchVoices();
    expect(list.default).toBe("a1-helios");
    expect(list.voices.map((v) => v.id)).toEqual(["a1-luna", "a1-helios"]);
    expect(list.voices[0]).not.toHaveProperty("model");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ai.example.dev/voices");
    expect(init.method).toBe("GET");
    expect(init.headers).toBeUndefined();
    expect(storage.getItem(VOICES_KEY)).not.toBeNull();

    await mod.fetchVoices();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A new page load reads localStorage instead of the network.
    const again = await load(async () => json(voices), storage);
    expect((await again.mod.fetchVoices()).default).toBe("a1-helios");
    expect(again.fetchMock).not.toHaveBeenCalled();

    vi.setSystemTime(new Date("2026-10-20T10:00:01Z"));
    await again.mod.fetchVoices();
    expect(again.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetchVoices falls back to the last list, else the built-in one", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T10:00:00Z"));
    const down = await load(async () => json({ error: "upstream" }, 502));
    expect(await down.mod.fetchVoices()).toEqual({ voices: FALLBACK_VOICES, default: "a1-asteria" });

    const storage = new MemoryStorage();
    const first = await load(async () => json(voices), storage);
    await first.mod.fetchVoices();
    vi.setSystemTime(new Date("2026-10-22T10:00:00Z"));
    const stale = await load(async () => Promise.reject(new TypeError("Failed to fetch")), storage);
    expect((await stale.mod.fetchVoices()).default).toBe("a1-helios");

    const offline = await load(async () => json(voices));
    vi.stubGlobal("navigator", { onLine: false });
    expect((await offline.mod.fetchVoices()).voices).toEqual(FALLBACK_VOICES);
    expect(offline.fetchMock).not.toHaveBeenCalled();
  });

  it("fetchVoices shares one request and honours the caller's abort", async () => {
    let release: (r: Response) => void = () => undefined;
    const { mod, fetchMock } = await load(() => new Promise<Response>((resolve) => (release = resolve)));
    const controller = new AbortController();
    const aborted = mod.fetchVoices(controller.signal);
    const plain = mod.fetchVoices();
    controller.abort();
    expect(((await aborted.catch((e: unknown) => e)) as { name?: string }).name).toBe("AbortError");
    release(json(voices));
    expect((await plain).default).toBe("a1-helios");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
