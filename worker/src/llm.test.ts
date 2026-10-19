import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { Deps, Env, FetchLike } from "./env";
import { FakeAi } from "./fakes";
import { completeWithFallback, fallbackModel, primaryModel } from "./llm";
import { UpstreamError } from "./openrouter";
import { WORKERS_AI_LLM } from "./workersai";

const request = { messages: [{ role: "user" as const, content: "Hi" }], maxTokens: 50, temperature: 0.5 };
const keep = (raw: string): string | null => raw || null;

function chat(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
}

function deps(fetch: FetchLike): Deps {
  return { fetch, cache: null, waitUntil: () => undefined, upstreamTimeoutMs: 50, aiTimeoutMs: 50 };
}

let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("completeWithFallback", () => {
  it("uses OpenRouter when it answers", async () => {
    const ai = new FakeAi({ [WORKERS_AI_LLM]: () => ({ response: "from ai" }) });
    const env: Env = { OPENROUTER_API_KEY: "k", AI: ai };
    const answer = await completeWithFallback(env, deps(async () => chat("from openrouter")), request, keep, "/t");
    expect(answer).toEqual({ value: "from openrouter", model: primaryModel(env) });
    expect(ai.calls).toEqual([]);
  });

  it.each([
    ["402 out of credits", async () => new Response("{}", { status: 402 })],
    ["429", async () => new Response("{}", { status: 429 })],
    ["503", async () => new Response("{}", { status: 503 })],
    ["empty answer", async () => chat("")],
    ["network error", async () => Promise.reject(new Error("offline"))],
  ] as Array<[string, FetchLike]>)("falls back to Workers AI on %s", async (_name, fetch) => {
    const ai = new FakeAi({ [WORKERS_AI_LLM]: () => ({ choices: [{ message: { content: "from ai" } }] }) });
    const answer = await completeWithFallback({ OPENROUTER_API_KEY: "k", AI: ai }, deps(fetch), request, keep, "/t");
    expect(answer).toEqual({ value: "from ai", model: WORKERS_AI_LLM });
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0]?.input).toMatchObject({ messages: request.messages, reasoning_effort: "low" });
  });

  it("falls back on a missing key, a timeout and an unparseable answer, using AI_MODEL when set", async () => {
    const ai = new FakeAi({ "@cf/x/llm": () => ({ response: "ok" }) });
    const env: Env = { AI: ai, AI_MODEL: "@cf/x/llm" };
    expect(fallbackModel(env)).toBe("@cf/x/llm");
    expect(await completeWithFallback(env, deps(async () => chat("x")), request, keep, "/t")).toEqual({ value: "ok", model: "@cf/x/llm" });

    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("abort"))));
    const timed = await completeWithFallback({ ...env, OPENROUTER_API_KEY: "k" }, deps(hang), request, keep, "/t");
    expect(timed.model).toBe("@cf/x/llm");

    const picky = (raw: string): string | null => (raw === "ok" ? raw : null);
    const parsed = await completeWithFallback({ ...env, OPENROUTER_API_KEY: "k" }, deps(async () => chat("junk")), request, picky, "/t");
    expect(parsed).toEqual({ value: "ok", model: "@cf/x/llm" });
    expect(JSON.stringify(warn.mock.calls)).toContain("openrouter failed on /t: empty; using Workers AI");
  });

  it("throws the OpenRouter error without an AI binding, and UpstreamError when both fail", async () => {
    const noAi = completeWithFallback({ OPENROUTER_API_KEY: "k" }, deps(async () => new Response("", { status: 402 })), request, keep, "/t");
    await expect(noAi).rejects.toMatchObject({ reason: "status", status: 402 });
    const ai = new FakeAi();
    const both = completeWithFallback({ OPENROUTER_API_KEY: "k", AI: ai }, deps(async () => new Response("", { status: 402 })), request, keep, "/t");
    await expect(both).rejects.toBeInstanceOf(UpstreamError);
    await expect(
      completeWithFallback({ AI: new FakeAi({ [WORKERS_AI_LLM]: () => ({ response: "x" }) }) }, deps(async () => chat("")), request, () => null, "/t"),
    ).rejects.toMatchObject({ reason: "empty" });
  });

  it("does not swallow programming errors", async () => {
    const boom = (): string => {
      throw new TypeError("bug");
    };
    await expect(completeWithFallback({ OPENROUTER_API_KEY: "k", AI: new FakeAi() }, deps(async () => chat("x")), request, boom, "/t")).rejects.toBeInstanceOf(TypeError);
  });
});
