import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { explainCacheHash, explainKvKey } from "./cache";
import type { Deps, Env, FetchLike } from "./env";
import { FakeAi, fakeMp3, FakeLimiter, MemoryKv, streamOf, type AiHandler } from "./fakes";
import { AUDIO_CACHE_CONTROL, FALLBACK_AUDIO_CACHE_CONTROL, handleRequest } from "./handler";
import { ANSWER_TTL_SECONDS, FALLBACK_ANSWER_TTL_SECONDS } from "./kv";
import { SttResponseSchema, TranslateResponseSchema, VoicesResponseSchema } from "./schemas";
import { WHISPER_TURBO } from "./stt";
import { translateCacheKey } from "./translate";
import { ttsCacheKey } from "./tts";
import { AURA_1, AURA_2, DEFAULT_VOICE, MELOTTS } from "./voices";
import { WORKERS_AI_LLM } from "./workersai";

const ORIGIN = "https://valorin777.github.io";
const DEVICE = "3f2b8c1e-9d4a-4f6b-8e2c-1a2b3c4d5e6f";
const IP = "203.0.113.7";
const BASE = "https://b2-sprint-ai.example.workers.dev";
const PRIMARY = "anthropic/claude-haiku-5.5";
const SENTENCE = "By the time I got there, the meeting had already started.";

const explainBody = {
  exerciseId: "d1-be-03",
  task: "Yesterday the meeting ___ at nine.",
  given: "is started",
  right: "started",
  rule: "Past simple: no be before the verb",
  category: "be-verb",
  lang: "en",
};

const coachBody = {
  history: [
    { role: "assistant", text: "Hi! What did you do at the weekend?" },
    { role: "user", text: "yesterday i am went to the park with my friends" },
  ],
  scenario: "Weekend small talk",
  focus: ["extra be"],
  level: "B1",
};

function chat(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
}

function aiChat(content: string): AiHandler {
  return () => ({ choices: [{ message: { role: "assistant", content, reasoning_content: "…" } }] });
}

const outOfCredits: FetchLike = async () =>
  new Response('{"error":{"message":"Insufficient credits"}}', { status: 402 });

interface Harness {
  env: Env;
  deps: Deps;
  ai: FakeAi;
  kv: MemoryKv;
  fetchMock: MockInstance<FetchLike>;
  limiter: FakeLimiter;
  ttsLimiter: FakeLimiter;
  settle: () => Promise<void>;
}

function harness(
  options: { ai?: Record<string, AiHandler>; fetch?: FetchLike; limiter?: FakeLimiter; ttsLimiter?: FakeLimiter } = {},
): Harness {
  const ai = new FakeAi(options.ai ?? {});
  const kv = new MemoryKv();
  const fetchMock = vi.fn<FetchLike>(options.fetch ?? (async () => chat("Ok")));
  const limiter = options.limiter ?? new FakeLimiter();
  const ttsLimiter = options.ttsLimiter ?? new FakeLimiter();
  const pending: Promise<unknown>[] = [];
  const env: Env = {
    OPENROUTER_API_KEY: "sk-or-test-secret",
    ALLOWED_ORIGINS: `${ORIGIN},http://localhost:3000`,
    MODEL: PRIMARY,
    LIMITER: limiter,
    TTS_LIMITER: ttsLimiter,
    AI: ai,
    TTS_CACHE: kv,
  };
  const deps: Deps = {
    fetch: fetchMock,
    cache: null,
    waitUntil: (promise) => void pending.push(promise),
    upstreamTimeoutMs: 50,
    aiTimeoutMs: 50,
  };
  return { env, deps, ai, kv, fetchMock, limiter, ttsLimiter, settle: async () => void (await Promise.all(pending)) };
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      "Content-Type": "application/json",
      "X-Device-Id": DEVICE,
      "CF-Connecting-IP": IP,
      ...headers,
    },
    body: typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body),
  });
}

function postAudio(bytes: Uint8Array, query = "", headers: Record<string, string> = {}): Request {
  return post(`/stt${query}`, bytes, { "Content-Type": "audio/webm;codecs=opus", ...headers });
}

let warn: MockInstance<typeof console.warn>;
let error: MockInstance<typeof console.error>;

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  error = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /voices", () => {
  it("lists the curated voices with a default, cacheable, with CORS", async () => {
    const h = harness();
    const res = await handleRequest(new Request(`${BASE}/voices`, { headers: { Origin: ORIGIN } }), h.env, h.deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
    const body = VoicesResponseSchema.parse(await res.json());
    expect(body.default).toBe(DEFAULT_VOICE);
    expect(body.voices.map((v) => v.model)).toContain(AURA_1);
    expect(body.voices.map((v) => v.model)).toContain(AURA_2);
    const post = await handleRequest(new Request(`${BASE}/voices`, { method: "POST", headers: { Origin: ORIGIN } }), h.env, h.deps);
    expect(post.status).toBe(405);
    expect(h.ai.calls).toEqual([]);
  });
});

describe("POST /tts", () => {
  it("returns Aura mp3 with long caching, the model header (exposed) and KV caching", async () => {
    const h = harness({ ai: { [AURA_2]: () => streamOf(fakeMp3("helena")) } });
    const res = await handleRequest(post("/tts", { text: `  ${SENTENCE}\n`, voice: "a2-helena" }), h.env, h.deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(res.headers.get("Cache-Control")).toBe(AUDIO_CACHE_CONTROL);
    expect(res.headers.get("X-TTS-Model")).toBe(AURA_2);
    expect(res.headers.get("X-Cache")).toBe("miss");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(res.headers.get("Access-Control-Expose-Headers")).toContain("X-TTS-Model");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(fakeMp3("helena"));
    expect(h.ai.calls[0]?.input).toEqual({ text: SENTENCE, speaker: "helena", encoding: "mp3" });
    await h.settle();
    expect(h.kv.keys()).toEqual([await ttsCacheKey("a2-helena", SENTENCE)]);

    const again = await handleRequest(post("/tts", { text: SENTENCE, voice: "a2-helena" }), h.env, h.deps);
    expect(again.headers.get("X-Cache")).toBe("hit");
    expect(new Uint8Array(await again.arrayBuffer())).toEqual(fakeMp3("helena"));
    expect(h.ai.calls).toHaveLength(1);
    expect(h.ttsLimiter.keys).toContain(`${DEVICE}:${IP}`);
    expect(h.limiter.keys).toEqual([]);
  });

  it("falls back to MeloTTS with a short cache lifetime, then 502", async () => {
    const h = harness({ ai: { [MELOTTS]: () => ({ audio: btoa("ID3\u0004melo") }) } });
    const res = await handleRequest(post("/tts", { text: SENTENCE, voice: "a1-asteria" }), h.env, h.deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-TTS-Model")).toBe(MELOTTS);
    expect(res.headers.get("Cache-Control")).toBe(FALLBACK_AUDIO_CACHE_CONTROL);
    expect(h.ai.models()).toEqual([AURA_1, MELOTTS]);
    expect(JSON.stringify(warn.mock.calls)).toContain("aura failed: status 4006");

    const dead = harness();
    const failed = await handleRequest(post("/tts", { text: SENTENCE, voice: "a1-asteria" }), dead.env, dead.deps);
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: "upstream" });
    expect(JSON.stringify([...warn.mock.calls, ...error.mock.calls])).not.toContain("meeting");
  });

  it("validates text (1–300 chars after flattening) and the voice id", async () => {
    const h = harness({ ai: { [AURA_2]: () => fakeMp3("x") } });
    for (const body of [
      { text: "", voice: "a2-helena" },
      { text: " \n\t ", voice: "a2-helena" },
      { text: "x".repeat(301), voice: "a2-helena" },
      { text: "Hi", voice: "a2-zeus" },
      { text: "Hi", voice: "a1-angus" },
      { text: "Hi" },
      { text: "Hi", voice: "a2-helena", speed: 2 },
    ]) {
      const res = await handleRequest(post("/tts", body), h.env, h.deps);
      expect(res.status).toBe(400);
    }
    const ok = await handleRequest(post("/tts", { text: `${"x".repeat(300)}  `, voice: "a2-helena" }), h.env, h.deps);
    expect(ok.status).toBe(200);
  });

  it("uses the TTS limiter (fails closed when missing) and the CORS allowlist", async () => {
    const limited = harness({ ttsLimiter: new FakeLimiter((key) => key.startsWith("ip:")) });
    expect((await handleRequest(post("/tts", { text: "Hi", voice: "a2-helena" }), limited.env, limited.deps)).status).toBe(429);
    const h = harness();
    const missing = await handleRequest(post("/tts", { text: "Hi", voice: "a2-helena" }), { ...h.env, TTS_LIMITER: undefined }, h.deps);
    expect(missing.status).toBe(503);
    const evil = await handleRequest(post("/tts", { text: "Hi", voice: "a2-helena" }, { Origin: "https://evil.example" }), h.env, h.deps);
    expect(evil.status).toBe(403);
    expect(evil.headers.get("Access-Control-Expose-Headers")).toBeNull();
    expect(h.ai.calls).toEqual([]);
  });
});

describe("POST /stt", () => {
  it("transcribes webm audio in the requested language", async () => {
    const h = harness({ ai: { [WHISPER_TURBO]: () => ({ text: " Never mind, I'll catch up with you later. " }) } });
    const res = await handleRequest(postAudio(fakeMp3("speech"), "?lang=ru"), h.env, h.deps);
    expect(res.status).toBe(200);
    expect(SttResponseSchema.parse(await res.json())).toEqual({ text: "Never mind, I'll catch up with you later." });
    expect(res.headers.get("X-AI-Model")).toBe(WHISPER_TURBO);
    expect(h.ai.calls[0]?.input).toMatchObject({ language: "ru" });
    expect(h.ttsLimiter.keys).toHaveLength(2);
  });

  it("defaults to English and returns empty text for silence", async () => {
    const h = harness({ ai: { [WHISPER_TURBO]: () => ({ text: "Thank you." }) } });
    const res = await handleRequest(postAudio(fakeMp3("silence")), h.env, h.deps);
    expect(await res.json()).toEqual({ text: "" });
    expect(h.ai.calls[0]?.input).toMatchObject({ language: "en" });
  });

  it("rejects other content types, languages, empty and oversized bodies", async () => {
    const h = harness({ ai: { [WHISPER_TURBO]: () => ({ text: "x" }) } });
    const json = await handleRequest(post("/stt", { audio: "x" }), h.env, h.deps);
    expect(json.status).toBe(415);
    expect((await handleRequest(postAudio(fakeMp3("x"), "?lang=de"), h.env, h.deps)).status).toBe(400);
    expect((await handleRequest(postAudio(new Uint8Array(0)), h.env, h.deps)).status).toBe(400);
    const declared = await handleRequest(postAudio(fakeMp3("x"), "", { "Content-Length": String(2 * 1024 * 1024) }), h.env, h.deps);
    expect(declared.status).toBe(413);
    const big = await handleRequest(postAudio(new Uint8Array(1.5 * 1024 * 1024 + 1)), h.env, h.deps);
    expect(big.status).toBe(413);
    expect(await big.json()).toEqual({ error: "too-large" });
    const exact = await handleRequest(postAudio(new Uint8Array(1.5 * 1024 * 1024).fill(1)), h.env, h.deps);
    expect(exact.status).toBe(200);
    expect(h.ai.calls).toHaveLength(1);
  });

  it("maps a failed transcription to 502 and needs the TTS limiter", async () => {
    const h = harness();
    expect((await handleRequest(postAudio(fakeMp3("x")), h.env, h.deps)).status).toBe(502);
    const limited = harness({ ttsLimiter: new FakeLimiter(() => true) });
    expect((await handleRequest(postAudio(fakeMp3("x")), limited.env, limited.deps)).status).toBe(429);
  });
});

describe("POST /translate", () => {
  const answer = JSON.stringify({
    translation: "Хватит тратить деньги впустую.",
    notes: [{ phrase: "waste money", meaning: "тратить деньги впустую" }],
  });

  it("translates through OpenRouter in JSON mode and caches in KV for 30 days", async () => {
    const h = harness({ fetch: async () => chat(answer) });
    const res = await handleRequest(post("/translate", { text: "Stop wasting money.", to: "auto" }), h.env, h.deps);
    expect(res.status).toBe(200);
    expect(TranslateResponseSchema.parse(await res.json())).toEqual({
      translation: "Хватит тратить деньги впустую.",
      from: "en",
      notes: [{ phrase: "waste money", meaning: "тратить деньги впустую" }],
    });
    expect(res.headers.get("X-AI-Model")).toBe(PRIMARY);
    const sent = JSON.parse((h.fetchMock.mock.calls[0]?.[1].body as string) ?? "{}") as Record<string, unknown>;
    expect(sent).toMatchObject({ response_format: { type: "json_object" }, max_tokens: 900 });
    expect(JSON.stringify(sent.messages)).toContain("from English into Russian");
    await h.settle();
    const key = await translateCacheKey("auto", "Stop wasting money.");
    expect(h.kv.store.get(key)?.ttl).toBe(ANSWER_TTL_SECONDS);

    const again = await handleRequest(post("/translate", { text: "  Stop wasting money. ", to: "auto" }), h.env, h.deps);
    expect(again.headers.get("X-Cache")).toBe("hit");
    expect(await again.json()).toMatchObject({ from: "en" });
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to Workers AI when OpenRouter is out of credits (402), RU→EN", async () => {
    const reply = JSON.stringify({ translation: "I wasted my money.", notes: [{ phrase: "потратил впустую", meaning: "wasted (not 'spent to trash')" }] });
    const h = harness({ fetch: outOfCredits, ai: { [WORKERS_AI_LLM]: aiChat(reply) } });
    const res = await handleRequest(post("/translate", { text: "Я потратил деньги впустую.", to: "auto" }), h.env, h.deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      translation: "I wasted my money.",
      from: "ru",
      notes: [{ phrase: "потратил впустую", meaning: "wasted (not 'spent to trash')" }],
    });
    expect(res.headers.get("X-AI-Model")).toBe(WORKERS_AI_LLM);
    expect(JSON.stringify(h.ai.calls[0]?.input)).toContain("from Russian into natural, idiomatic English");
    await h.settle();
    const key = await translateCacheKey("auto", "Я потратил деньги впустую.");
    expect(h.kv.store.get(key)?.ttl).toBe(FALLBACK_ANSWER_TTL_SECONDS);
  });

  it("validates the body and maps a double failure to 502", async () => {
    const h = harness({ fetch: outOfCredits });
    for (const body of [{ text: "", to: "ru" }, { text: "x".repeat(601), to: "ru" }, { text: "Hi", to: "fr" }, { text: "Hi" }]) {
      expect((await handleRequest(post("/translate", body), h.env, h.deps)).status).toBe(400);
    }
    const res = await handleRequest(post("/translate", { text: "Hi", to: "ru" }), h.env, h.deps);
    expect(res.status).toBe(502);
    expect(h.limiter.keys.length).toBeGreaterThan(0);
    expect(h.ttsLimiter.keys).toEqual([]);
  });
});

describe("LLM fallback on /explain and /coach", () => {
  it("/explain answers from Workers AI on 402, sets X-AI-Model and caches in KV", async () => {
    const h = harness({ fetch: outOfCredits, ai: { [WORKERS_AI_LLM]: aiChat("Past simple needs no *be*: just **started**.") } });
    const res = await handleRequest(post("/explain", explainBody), h.env, h.deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "Past simple needs no be: just **started**.", cached: false });
    expect(res.headers.get("X-AI-Model")).toBe(WORKERS_AI_LLM);
    expect(res.headers.get("Access-Control-Expose-Headers")).toContain("X-AI-Model");
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    expect(h.ai.calls[0]?.input).toMatchObject({ max_tokens: 140 + 512 });
    await h.settle();
    const key = explainKvKey(await explainCacheHash(PRIMARY, explainBody.exerciseId, explainBody.given, "en"));
    expect(h.kv.store.get(key)?.ttl).toBe(FALLBACK_ANSWER_TTL_SECONDS);

    const again = await handleRequest(post("/explain", explainBody), h.env, h.deps);
    expect(await again.json()).toMatchObject({ cached: true });
    expect(again.headers.get("X-AI-Model")).toBe(WORKERS_AI_LLM);
    expect(h.ai.calls).toHaveLength(1);
    expect(JSON.stringify(warn.mock.calls)).toContain("openrouter failed on /explain: status 402");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("is started");
  });

  it("/explain caches the primary model's answer in KV for 30 days", async () => {
    const h = harness({ fetch: async () => chat("No **be** here.") });
    const res = await handleRequest(post("/explain", explainBody), h.env, h.deps);
    expect(res.headers.get("X-AI-Model")).toBe(PRIMARY);
    await h.settle();
    expect([...h.kv.store.values()][0]?.ttl).toBe(ANSWER_TTL_SECONDS);
    expect(h.ai.calls).toEqual([]);
  });

  it("/coach answers from Workers AI on 402 with a checked correction", async () => {
    const reply = JSON.stringify({
      reply: "Oh, nice! Who did you go with?",
      correction: { wrong: "i am went", right: "I went", why: "Past simple needs no 'am'." },
    });
    const h = harness({ fetch: outOfCredits, ai: { [WORKERS_AI_LLM]: aiChat(reply) } });
    const res = await handleRequest(post("/coach", coachBody), h.env, h.deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      reply: "Oh, nice! Who did you go with?",
      correction: { wrong: "i am went", right: "I went", why: "Past simple needs no 'am'.", type: "other" },
      tip: null,
      ended: false,
    });
    expect(res.headers.get("X-AI-Model")).toBe(WORKERS_AI_LLM);
    expect(h.ai.calls[0]?.input).toMatchObject({ response_format: { type: "json_object" }, reasoning_effort: "low" });
  });

  it("/coach falls back when OpenRouter's answer is unusable, and 502s when both fail", async () => {
    const h = harness({ fetch: async () => chat('{"oops":true}'), ai: { [WORKERS_AI_LLM]: aiChat('{"reply":"Great! Why?","correction":null}') } });
    expect(await (await handleRequest(post("/coach", coachBody), h.env, h.deps)).json()).toMatchObject({ reply: "Great! Why?" });
    const dead = harness({ fetch: outOfCredits });
    expect((await handleRequest(post("/coach", coachBody), dead.env, dead.deps)).status).toBe(502);
  });
});

describe("preflight for the new routes", () => {
  it("allows audio uploads and JSON posts from allowed origins", async () => {
    const h = harness();
    for (const path of ["/tts", "/stt", "/translate", "/voices"]) {
      const res = await handleRequest(new Request(`${BASE}${path}`, { method: "OPTIONS", headers: { Origin: ORIGIN } }), h.env, h.deps);
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, X-Device-Id");
    }
  });
});

describe("split coach: reply now, review separately", () => {
  it("/coach with split returns only the reply; /coach-review returns correction and tip from the review model", async () => {
    const h = harness();
    const models: string[] = [];
    h.fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { model: string };
      models.push(body.model);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: "So you went! Why?", correction: { wrong: "i am went", right: "I went", why: "No am before a normal verb.", type: "extra-be" }, tip: { title: "T", text: "X." } }) } }] }),
        { status: 200 },
      );
    });
    const coachBody = { history: [{ role: "assistant", text: "Hi!" }, { role: "user", text: "i am went to the park" }], scenario: "s", focus: [], level: "B1" };
    const fast = await handleRequest(post("/coach", { ...coachBody, split: true }), h.env, h.deps);
    expect(await fast.json()).toEqual({ reply: "So you went! Why?", correction: null, tip: null, ended: false });
    const review = await handleRequest(post("/coach-review", { ...coachBody, ledger: [{ wrong: "i am agree", right: "I agree", type: "extra-be" }] }), h.env, h.deps);
    const r = (await review.json()) as { correction: { why: string; type: string }; tip: { title: string } };
    expect(r.correction.type).toBe("extra-be");
    expect(r.correction.why).toMatch(/^Again \(2nd time\): /);
    expect(r.tip.title).toBe("T");
    expect(models).toEqual(["anthropic/claude-sonnet-5.5", "anthropic/claude-sonnet-5.5"]);
  });
});
