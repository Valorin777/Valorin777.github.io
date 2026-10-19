import { DEFAULT_MODEL, type Env, type FetchLike } from "./env";
import type { ChatMessage } from "./prompts";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const APP_REFERER = "https://valorin777.github.io/b2/";
export const APP_TITLE = "B2 Sprint";
export const UPSTREAM_TIMEOUT_MS = 15_000;

export type UpstreamReason = "config" | "timeout" | "network" | "status" | "empty";

/** Anything that went wrong talking to OpenRouter. Clients only ever see 502 {error:"upstream"}. */
export class UpstreamError extends Error {
  readonly reason: UpstreamReason;
  readonly status: number | null;

  constructor(reason: UpstreamReason, status: number | null = null) {
    super(`upstream ${reason}${status === null ? "" : ` ${status}`}`);
    this.name = "UpstreamError";
    this.reason = reason;
    this.status = status;
  }
}

export interface CompletionRequest {
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  /** Ask for response_format json_object. */
  json?: boolean;
}

export interface ModelQuirks {
  /** false: the model rejects a non-default temperature, so none is sent. */
  temperature: boolean;
  /** true: send reasoning {effort:"none"} so thinking cannot eat the small max_tokens budget. */
  disableReasoning: boolean;
  lowReasoning: boolean;
}

/**
 * Claude Opus 4.7+ and the whole Claude 5 family reject non-default sampling parameters with a
 * 400. Claude Haiku 5.x thinks by default but, unlike Opus 5.5, allows turning it off.
 */
export function modelQuirks(model: string): ModelQuirks {
  const id = model.toLowerCase();
  const fixedSampling = /^anthropic\/claude-(?:(?:opus|sonnet|haiku|fable|mythos)-5|opus-4[.-][78])/.test(id);
  return {
    temperature: !fixedSampling,
    disableReasoning: /^anthropic\/claude-haiku-5/.test(id),
    // Sonnet 5.x refuses "none" but keeps thinking short (about 2 s) at "low".
    lowReasoning: /^anthropic\/claude-sonnet-5/.test(id),
  };
}

export function buildCompletionBody(model: string, request: CompletionRequest): Record<string, unknown> {
  const quirks = modelQuirks(model);
  const body: Record<string, unknown> = {
    model,
    messages: request.messages,
    max_tokens: request.maxTokens,
  };
  if (quirks.temperature) body.temperature = request.temperature;
  if (quirks.disableReasoning) body.reasoning = { effort: "none" };
  else if (quirks.lowReasoning) body.reasoning = { effort: "low" };
  if (request.json) body.response_format = { type: "json_object" };
  return body;
}

interface ChoiceShape {
  message?: { content?: unknown };
}

/** Text of the first choice; content may be a string or an array of {type:"text", text} parts. */
export function completionText(data: unknown): string {
  if (data === null || typeof data !== "object") return "";
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const content = (choices[0] as ChoiceShape).message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part: unknown) =>
        part !== null && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
          ? (part as { text: string }).text
          : "",
      )
      .join("")
      .trim();
  }
  return "";
}

/** One chat completion through OpenRouter. Throws UpstreamError, never leaks response bodies. */
export async function complete(
  env: Pick<Env, "OPENROUTER_API_KEY" | "MODEL">,
  request: CompletionRequest,
  fetchImpl: FetchLike,
  timeoutMs: number = UPSTREAM_TIMEOUT_MS,
): Promise<string> {
  const key = env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new UpstreamError("config");
  const model = env.MODEL?.trim() || DEFAULT_MODEL;
  const controller = new AbortController();
  let timedOut = false;
  const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetchImpl(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": APP_REFERER,
          "X-Title": APP_TITLE,
        },
        body: JSON.stringify(buildCompletionBody(model, request)),
        signal: controller.signal,
      });
    } catch {
      throw new UpstreamError(timedOut ? "timeout" : "network");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new UpstreamError("status", response.status);
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new UpstreamError(timedOut ? "timeout" : "empty", response.status);
    }
    const text = completionText(data);
    if (!text) throw new UpstreamError("empty", response.status);
    return text;
  } finally {
    clearTimeout(timer);
  }
}
