import { describe, expect, it } from "vitest";
import { FakeAi } from "./fakes";
import { UpstreamError } from "./openrouter";
import {
  aiChatText,
  aiComplete,
  aiErrorCode,
  buildAiChatInput,
  REASONING_HEADROOM_TOKENS,
  runAi,
  WORKERS_AI_LLM,
} from "./workersai";

const request = {
  messages: [
    { role: "system" as const, content: "Be kind." },
    { role: "user" as const, content: "Hi" },
  ],
  maxTokens: 140,
  temperature: 0.4,
};

describe("aiErrorCode", () => {
  it("pulls the Workers AI error code out of the message", () => {
    expect(aiErrorCode(new Error("InferenceUpstreamError: 4006: you have used up your daily free allocation"))).toBe(4006);
    expect(aiErrorCode(new Error("5007: No such model"))).toBe(5007);
    expect(aiErrorCode(new Error("network down"))).toBeNull();
    expect(aiErrorCode(42)).toBeNull();
  });
});

describe("runAi", () => {
  it("turns a missing binding, a thrown error and a hang into UpstreamError", async () => {
    await expect(runAi(undefined, "m", {})).rejects.toMatchObject({ reason: "config" });
    await expect(runAi(new FakeAi(), "m", {})).rejects.toMatchObject({ reason: "status", status: 4006 });
    const hanging = { run: () => new Promise<unknown>(() => undefined) };
    const error = await runAi(hanging, "m", {}, 20).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpstreamError);
    expect(error).toMatchObject({ reason: "timeout" });
  });

  it("passes the model and input through", async () => {
    const ai = new FakeAi({ m: (input) => ({ echo: input }) });
    expect(await runAi(ai, "m", { a: 1 })).toEqual({ echo: { a: 1 } });
  });
});

describe("buildAiChatInput", () => {
  it("gives gpt-oss low reasoning effort and headroom, no temperature", () => {
    const input = buildAiChatInput(WORKERS_AI_LLM, { ...request, json: true });
    expect(input).toEqual({
      messages: request.messages,
      max_tokens: 140 + REASONING_HEADROOM_TOKENS,
      reasoning_effort: "low",
      response_format: { type: "json_object" },
    });
  });

  it("sends temperature and the plain budget to other models", () => {
    expect(buildAiChatInput("@cf/meta/llama-3.3-70b-instruct-fp8-fast", request)).toEqual({
      messages: request.messages,
      max_tokens: 140,
      temperature: 0.4,
    });
  });
});

describe("aiChatText", () => {
  it("reads OpenAI chat, classic, JSON-mode and Responses API shapes", () => {
    expect(aiChatText({ choices: [{ message: { content: " Hello ", reasoning_content: "thinking" } }] })).toBe("Hello");
    expect(aiChatText({ response: " Hi " })).toBe("Hi");
    expect(aiChatText({ response: { reply: "Hi", correction: null } })).toBe('{"reply":"Hi","correction":null}');
    expect(aiChatText({ output_text: "Yo" })).toBe("Yo");
    expect(
      aiChatText({
        output: [
          { type: "reasoning", content: [{ type: "reasoning_text", text: "hmm" }] },
          { type: "message", content: [{ type: "output_text", text: "Final" }] },
        ],
      }),
    ).toBe("Final");
    expect(aiChatText("plain")).toBe("plain");
    expect(aiChatText({ nothing: true })).toBe("");
    expect(aiChatText(null)).toBe("");
  });
});

describe("aiComplete", () => {
  it("returns the text or throws empty", async () => {
    const ai = new FakeAi({ [WORKERS_AI_LLM]: () => ({ choices: [{ message: { content: "Sure." } }] }) });
    expect(await aiComplete(ai, WORKERS_AI_LLM, request)).toBe("Sure.");
    const empty = new FakeAi({ [WORKERS_AI_LLM]: () => ({ choices: [{ message: { content: "" } }] }) });
    await expect(aiComplete(empty, WORKERS_AI_LLM, request)).rejects.toMatchObject({ reason: "empty" });
  });
});
