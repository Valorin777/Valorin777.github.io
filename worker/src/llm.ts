import { DEFAULT_MODEL, type Deps, type Env } from "./env";
import { complete, UpstreamError, type CompletionRequest } from "./openrouter";
import { aiComplete, WORKERS_AI_LLM } from "./workersai";

export interface LlmAnswer<T> {
  value: T;
  /** The model that produced the answer (sent to the client as X-AI-Model). */
  model: string;
}

export function primaryModel(env: Pick<Env, "MODEL">): string {
  return env.MODEL?.trim() || DEFAULT_MODEL;
}

export function fallbackModel(env: Pick<Env, "AI_MODEL">): string {
  return env.AI_MODEL?.trim() || WORKERS_AI_LLM;
}

/**
 * OpenRouter first; on any failure (402 out of credits, 429, 5xx, timeout, missing key, or an
 * answer `parse` cannot use) one retry with the same messages on Workers AI.
 * Throws UpstreamError when both fail.
 */
export async function completeWithFallback<T>(
  env: Env,
  deps: Deps,
  request: CompletionRequest,
  parse: (raw: string) => T | null,
  label: string,
): Promise<LlmAnswer<T>> {
  let failure: UpstreamError;
  try {
    const value = parse(await complete(env, request, deps.fetch, deps.upstreamTimeoutMs));
    if (value !== null) return { value, model: primaryModel(env) };
    failure = new UpstreamError("empty");
  } catch (error) {
    if (!(error instanceof UpstreamError)) throw error;
    failure = error;
  }
  if (!env.AI) throw failure;
  // Reason and status only, as in the handler: never the key, the prompt or the learner's text.
  console.warn(`openrouter failed on ${label}: ${failure.reason}${failure.status === null ? "" : ` ${failure.status}`}; using Workers AI`);
  const model = fallbackModel(env);
  const value = parse(await aiComplete(env.AI, model, request, deps.aiTimeoutMs));
  if (value === null) throw new UpstreamError("empty");
  return { value, model };
}
