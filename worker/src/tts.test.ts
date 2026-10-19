import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bytesToBase64 } from "./audio";
import type { Deps } from "./env";
import { FakeAi, fakeMp3, MemoryKv, streamOf } from "./fakes";
import { MELO_VOICE, normalizeTtsText, synthesize, ttsCacheKey } from "./tts";
import { AURA_1, AURA_2, MELOTTS } from "./voices";

const TEXT = "By the time I got there, the meeting had already started.";

function setup(handlers: ConstructorParameters<typeof FakeAi>[0]) {
  const ai = new FakeAi(handlers);
  const kv = new MemoryKv();
  const pending: Promise<unknown>[] = [];
  const deps: Pick<Deps, "waitUntil" | "aiTimeoutMs" | "fetch"> = {
    waitUntil: (p) => void pending.push(p),
    aiTimeoutMs: 50,
    fetch: async () => new Response("", { status: 500 }),
  };
  return { ai, kv, deps, env: { AI: ai, TTS_CACHE: kv }, settle: () => Promise.all(pending) };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("ttsCacheKey", () => {
  it("is tts: + sha256(voice|text) and differs per voice", async () => {
    const key = await ttsCacheKey("a1-asteria", "Hi");
    expect(key).toMatch(/^tts:[0-9a-f]{64}$/);
    expect(await ttsCacheKey("a2-helena", "Hi")).not.toBe(key);
    expect(normalizeTtsText("  Hi\n\tthere  ")).toBe("Hi there");
  });
});

describe("synthesize", () => {
  it("calls Aura once with speaker + mp3, stores the bytes forever and serves repeats from KV", async () => {
    const s = setup({ [AURA_2]: () => streamOf(fakeMp3("helena")) });
    const first = await synthesize(s.env, s.deps, "a2-helena", TEXT);
    expect(first).toMatchObject({ model: AURA_2, contentType: "audio/mpeg", fallback: false, cached: false });
    expect(first.bytes).toEqual(fakeMp3("helena"));
    expect(s.ai.calls).toEqual([{ model: AURA_2, input: { text: TEXT, speaker: "helena", encoding: "mp3" } }]);
    await s.settle();
    const key = await ttsCacheKey("a2-helena", TEXT);
    expect(s.kv.store.get(key)?.ttl).toBeUndefined();

    const again = await synthesize(s.env, s.deps, "a2-helena", TEXT);
    expect(again).toMatchObject({ model: AURA_2, cached: true });
    expect(again.bytes).toEqual(fakeMp3("helena"));
    expect(s.ai.calls).toHaveLength(1);
  });

  it("uses Aura-1 for a1- voices and accepts ArrayBuffer output", async () => {
    const s = setup({ [AURA_1]: () => fakeMp3("asteria").buffer });
    const speech = await synthesize(s.env, s.deps, "a1-asteria", TEXT);
    expect(speech.model).toBe(AURA_1);
    expect(s.ai.calls[0]?.input).toMatchObject({ speaker: "asteria" });
  });

  it("falls back to MeloTTS (base64) on an Aura error and caches it under the melo key only", async () => {
    const s = setup({ [MELOTTS]: () => ({ audio: bytesToBase64(fakeMp3("melo")) }) });
    const speech = await synthesize(s.env, s.deps, "a2-helena", TEXT);
    expect(speech).toMatchObject({ model: MELOTTS, fallback: true, cached: false });
    expect(s.ai.models()).toEqual([AURA_2, MELOTTS]);
    expect(s.ai.calls[1]?.input).toEqual({ prompt: TEXT, lang: "en" });
    await s.settle();
    expect(s.kv.keys()).toEqual([await ttsCacheKey(MELO_VOICE, TEXT)]);

    // Aura is tried again next time; the cached Melo audio is reused while it still fails.
    const again = await synthesize(s.env, s.deps, "a2-helena", TEXT);
    expect(again).toMatchObject({ model: MELOTTS, cached: true, fallback: true });
    expect(s.ai.models()).toEqual([AURA_2, MELOTTS, AURA_2]);
  });

  it("treats non-audio output as a failure and throws when both models fail", async () => {
    const s = setup({ [AURA_2]: () => new TextEncoder().encode('{"error":"oops"}'), [MELOTTS]: () => ({ audio: "" }) });
    await expect(synthesize(s.env, s.deps, "a2-helena", TEXT)).rejects.toMatchObject({ name: "UpstreamError" });
    expect(s.ai.models()).toEqual([AURA_2, MELOTTS]);
  });

  it("serves MeloTTS's real output, base64 WAV, as audio/wav", async () => {
    const wav = new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WAVEfmt data");
    const s = setup({ [MELOTTS]: () => ({ audio: bytesToBase64(wav) }) });
    const speech = await synthesize(s.env, s.deps, "a2-thalia", TEXT);
    expect(speech).toMatchObject({ model: MELOTTS, contentType: "audio/wav" });
    expect(speech.bytes).toEqual(wav);
  });

  it("still works without KV and serves Melo binary output", async () => {
    const ai = new FakeAi({ [MELOTTS]: () => fakeMp3("melo") });
    const speech = await synthesize({ AI: ai }, { waitUntil: () => undefined, fetch: async () => new Response("", { status: 500 }) }, "a2-draco", TEXT);
    expect(speech).toMatchObject({ model: MELOTTS, fallback: true });
  });
});

describe("OpenAI voice", () => {
  const sse = (pcm: Uint8Array) =>
    `data: {"choices":[{"delta":{"audio":{"data":"${bytesToBase64(pcm.slice(0, 6000))}"}}}]}\n\ndata: {"choices":[{"delta":{"audio":{"data":"${bytesToBase64(pcm.slice(6000))}","transcript":"${TEXT}"}}}]}\n\ndata: [DONE]\n`;

  it("streams PCM from OpenRouter, wraps it in WAV and caches it under the voice key", async () => {
    const s = setup({});
    const pcm = new Uint8Array(12000).map((_, i) => i % 251);
    const calls: string[] = [];
    s.deps.fetch = async (url, init) => {
      calls.push(url);
      expect(JSON.parse(init.body)).toMatchObject({ model: "openai/gpt-audio-mini", audio: { voice: "marin", format: "pcm16" }, stream: true });
      return new Response(sse(pcm), { status: 200 });
    };
    const speech = await synthesize({ ...s.env, OPENROUTER_API_KEY: "k" }, s.deps, "oa-marin", TEXT);
    expect(calls).toHaveLength(1);
    expect(speech.contentType).toBe("audio/wav");
    expect(speech.bytes.byteLength).toBe(44 + 12000);
    expect(speech.fallback).toBe(false);
    await s.settle();
    const again = await synthesize({ ...s.env, OPENROUTER_API_KEY: "k" }, s.deps, "oa-marin", TEXT);
    expect(again.cached).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("falls back to the free Aura voice when OpenRouter fails", async () => {
    const s = setup({ [AURA_2]: () => fakeMp3("thalia") });
    const speech = await synthesize({ ...s.env, OPENROUTER_API_KEY: "k" }, s.deps, "oa-marin", TEXT);
    expect(speech.model).toBe(AURA_2);
    expect(speech.fallback).toBe(true);
  });
});

describe("OpenAI voice reads, never answers", () => {
  it("rejects a take whose transcript is an answer and falls back", async () => {
    const s = setup({ [AURA_2]: () => fakeMp3("thalia") });
    const pcm = bytesToBase64(new Uint8Array(12000));
    s.deps.fetch = async () =>
      new Response(`data: {"choices":[{"delta":{"audio":{"data":"${pcm}","transcript":"Of course! The station is just down the road."}}}]}\n\n`, { status: 200 });
    const speech = await synthesize({ ...s.env, OPENROUTER_API_KEY: "k" }, s.deps, "oa-marin", "Could you tell me where the station is?");
    expect(speech.fallback).toBe(true);
    expect(speech.model).toBe(AURA_2);
  });
});
