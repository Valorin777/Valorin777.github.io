import type { AiBinding } from "./env";
import { completionText, UpstreamError, type CompletionRequest } from "./openrouter";

/** Best instruction model on Workers AI for faithful JSON and short answers (free-plan model). */
export const WORKERS_AI_LLM = "@cf/openai/gpt-oss-120b";
export const AI_TIMEOUT_MS = 20_000;
/** gpt-oss always reasons and the reasoning counts against max_tokens. */
export const REASONING_HEADROOM_TOKENS = 512;

/** "4006: you have used up your daily free allocation…" → 4006. Only the code is ever logged. */
export function aiErrorCode(error: unknown): number | null {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const match = /\b(\d{4}):/.exec(message);
  return match ? Number(match[1]) : null;
}

/** env.AI.run with a timeout; every failure becomes an UpstreamError (status = Workers AI error code). */
export async function runAi(
  ai: AiBinding | undefined,
  model: string,
  input: unknown,
  timeoutMs: number = AI_TIMEOUT_MS,
): Promise<unknown> {
  if (!ai) throw new UpstreamError("config");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new UpstreamError("timeout")), timeoutMs);
  });
  const run = (async () => {
    try {
      return await ai.run(model, input);
    } catch (error) {
      throw new UpstreamError("status", aiErrorCode(error));
    }
  })();
  try {
    return await Promise.race([run, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function isReasoningModel(model: string): boolean {
  return /gpt-oss|qwq|deepseek-r1|qwen3/i.test(model);
}

export function buildAiChatInput(model: string, request: CompletionRequest): Record<string, unknown> {
  const input: Record<string, unknown> = { messages: request.messages, max_tokens: request.maxTokens };
  if (isReasoningModel(model)) {
    input.max_tokens = request.maxTokens + REASONING_HEADROOM_TOKENS;
    // Low effort: about 2 s instead of 6 s for a coach turn, with the same answer quality.
    input.reasoning_effort = "low";
  } else {
    input.temperature = request.temperature;
  }
  if (request.json) input.response_format = { type: "json_object" };
  return input;
}

function partsText(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part: unknown) =>
      part !== null && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
        ? (part as { text: string }).text
        : "",
    )
    .join("");
}

/**
 * The answer text of a Workers AI text model, whatever shape it uses: OpenAI chat completion
 * (gpt-oss), classic { response } (Llama; an object in JSON mode), or the Responses API.
 */
export function aiChatText(output: unknown): string {
  if (typeof output === "string") return output.trim();
  if (output === null || typeof output !== "object") return "";
  const chat = completionText(output);
  if (chat) return chat;
  const data = output as { response?: unknown; output_text?: unknown; output?: unknown };
  if (typeof data.response === "string") return data.response.trim();
  if (data.response !== null && typeof data.response === "object") return JSON.stringify(data.response);
  if (typeof data.output_text === "string") return data.output_text.trim();
  if (Array.isArray(data.output)) {
    return data.output
      .map((item: unknown) =>
        item !== null && typeof item === "object" && (item as { type?: unknown }).type === "message"
          ? partsText((item as { content?: unknown }).content)
          : "",
      )
      .join("")
      .trim();
  }
  return "";
}

/** One chat completion on Workers AI. Throws UpstreamError like the OpenRouter client. */
export async function aiComplete(
  ai: AiBinding | undefined,
  model: string,
  request: CompletionRequest,
  timeoutMs: number = AI_TIMEOUT_MS,
): Promise<string> {
  const output = await runAi(ai, model, buildAiChatInput(model, request), timeoutMs);
  const text = aiChatText(output);
  if (!text) throw new UpstreamError("empty");
  return text;
}
