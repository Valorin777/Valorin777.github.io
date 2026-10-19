import { describe, expect, it, vi } from "vitest";
import type { FetchInit, FetchLike } from "./env";
import {
  buildCompletionBody,
  complete,
  completionText,
  modelQuirks,
  OPENROUTER_URL,
  UpstreamError,
} from "./openrouter";

const KEY = "sk-or-test-key";
const messages = [
  { role: "system" as const, content: "sys" },
  { role: "user" as const, content: "hi" },
];

function okResponse(content: unknown): Response {
  return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function failure(promise: Promise<unknown>): Promise<UpstreamError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof UpstreamError) return error;
    throw error;
  }
  throw new Error("expected an UpstreamError");
}

describe("modelQuirks", () => {
  it("drops temperature and thinking for Claude Haiku 5.5", () => {
    expect(modelQuirks("anthropic/claude-haiku-5.5")).toEqual({ temperature: false, disableReasoning: true, lowReasoning: false });
  });

  it("drops temperature for the other fixed-sampling Claude models", () => {
    expect(modelQuirks("anthropic/claude-sonnet-5.5").temperature).toBe(false);
    expect(modelQuirks("anthropic/claude-opus-4.8").temperature).toBe(false);
    expect(modelQuirks("anthropic/claude-opus-5.5").disableReasoning).toBe(false);
  });

  it("keeps temperature for older or non-Anthropic models", () => {
    expect(modelQuirks("anthropic/claude-haiku-4.5")).toEqual({ temperature: true, disableReasoning: false, lowReasoning: false });
    expect(modelQuirks("anthropic/claude-sonnet-4.6").temperature).toBe(true);
    expect(modelQuirks("openai/gpt-x-mini").temperature).toBe(true);
  });
});

describe("buildCompletionBody", () => {
  it("sends model, messages, max_tokens and the JSON format when asked", () => {
    const body = buildCompletionBody("anthropic/claude-haiku-5.5", {
      messages,
      maxTokens: 220,
      temperature: 0.7,
      json: true,
    });
    expect(body).toEqual({
      model: "anthropic/claude-haiku-5.5",
      messages,
      max_tokens: 220,
      reasoning: { effort: "none" },
      response_format: { type: "json_object" },
    });
  });

  it("sends temperature where the model accepts it", () => {
    const body = buildCompletionBody("openai/gpt-x-mini", { messages, maxTokens: 140, temperature: 0.4 });
    expect(body).toEqual({ model: "openai/gpt-x-mini", messages, max_tokens: 140, temperature: 0.4 });
  });
});

describe("completionText", () => {
  it("reads string and part-array content", () => {
    expect(completionText({ choices: [{ message: { content: "  Hello " } }] })).toBe("Hello");
    expect(
      completionText({ choices: [{ message: { content: [{ type: "text", text: "A" }, { type: "x" }, { text: "B" }] } }] }),
    ).toBe("AB");
  });

  it("returns empty for anything else", () => {
    expect(completionText(null)).toBe("");
    expect(completionText({ choices: [] })).toBe("");
    expect(completionText({ error: { message: "nope" } })).toBe("");
    expect(completionText({ choices: [{ message: { content: 5 } }] })).toBe("");
  });
});

describe("complete", () => {
  it("posts to OpenRouter with the key, referer and title", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => okResponse("Hello"));
    const text = await complete(
      { OPENROUTER_API_KEY: KEY, MODEL: "anthropic/claude-haiku-5.5" },
      { messages, maxTokens: 140, temperature: 0.4 },
      fetchMock,
    );
    expect(text).toBe("Hello");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, FetchInit];
    expect(url).toBe(OPENROUTER_URL);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(init.headers["HTTP-Referer"]).toBe("https://valorin777.github.io/b2/");
    expect(init.headers["X-Title"]).toBe("B2 Sprint");
    expect(JSON.parse(init.body)).toMatchObject({ model: "anthropic/claude-haiku-5.5", max_tokens: 140 });
  });

  it("uses the default model when MODEL is not set", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => okResponse("Hi"));
    await complete({ OPENROUTER_API_KEY: KEY }, { messages, maxTokens: 10, temperature: 0 }, fetchMock);
    const [, init] = fetchMock.mock.calls[0] as [string, FetchInit];
    expect(JSON.parse(init.body).model).toBe("anthropic/claude-haiku-5.5");
  });

  it("fails with config when the key is missing, without calling out", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => okResponse("Hi"));
    const error = await failure(complete({}, { messages, maxTokens: 10, temperature: 0 }, fetchMock));
    expect(error.reason).toBe("config");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps HTTP errors, network errors and empty answers", async () => {
    const env = { OPENROUTER_API_KEY: KEY };
    const request = { messages, maxTokens: 10, temperature: 0 };
    const status = await failure(
      complete(env, request, async () => new Response('{"error":{"message":"secret detail"}}', { status: 402 })),
    );
    expect(status).toMatchObject({ reason: "status", status: 402 });
    expect(status.message).not.toContain("secret detail");
    const network = await failure(complete(env, request, async () => Promise.reject(new TypeError("down"))));
    expect(network.reason).toBe("network");
    const empty = await failure(complete(env, request, async () => okResponse("   ")));
    expect(empty.reason).toBe("empty");
    const notJson = await failure(complete(env, request, async () => new Response("<html>", { status: 200 })));
    expect(notJson.reason).toBe("empty");
  });

  it("aborts after the timeout", async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    const error = await failure(
      complete({ OPENROUTER_API_KEY: KEY }, { messages, maxTokens: 10, temperature: 0 }, hang, 20),
    );
    expect(error.reason).toBe("timeout");
  });
});
