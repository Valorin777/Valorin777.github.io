/**
 * Bindings and the few runtime services the worker uses. They are declared here instead of
 * relying on @cloudflare/workers-types globals so the same files also typecheck under the
 * Next.js app's tsconfig (which includes every *.ts in the repo) and run in plain Node tests.
 */

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** The subset of the Workers Cache API (caches.default) the worker needs. */
export interface CacheLike {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

/** The Workers AI binding (`"ai": { "binding": "AI" }`). Throws on any model or quota error. */
export interface AiBinding {
  run(model: string, input: unknown, options?: unknown): Promise<unknown>;
}

/** The subset of a KV namespace the worker needs (audio, translations, explanations). */
export interface KvLike {
  get(key: string, type: "text"): Promise<string | null>;
  get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  put(key: string, value: string | ArrayBuffer, options?: { expirationTtl?: number }): Promise<void>;
}

export interface Env {
  /** Secret: `npx wrangler secret put OPENROUTER_API_KEY`. Never logged, never returned. */
  OPENROUTER_API_KEY?: string;
  /** Comma-separated list of exact origins allowed to call the API from a browser. */
  ALLOWED_ORIGINS?: string;
  /** OpenRouter model id, e.g. "anthropic/claude-haiku-5.5". */
  MODEL?: string;
  /** Model for the voice coach (needs the best explanations); defaults to Claude Sonnet 5.5. */
  COACH_MODEL?: string;
  /** Model for the coach's examiner (/coach-review); defaults to Claude Sonnet 5.5. */
  REVIEW_MODEL?: string;
  /** Workers AI text model used when OpenRouter fails; defaults to WORKERS_AI_LLM. */
  AI_MODEL?: string;
  LIMITER?: RateLimiter;
  /** Separate, larger budget for /tts and /stt: one lesson plays many short clips. */
  TTS_LIMITER?: RateLimiter;
  AI?: AiBinding;
  /** KV namespace, keys "tts:" (audio), "tr:" (translations), "ex:" (explanations). */
  TTS_CACHE?: KvLike;
}

export interface FetchInit {
  method: string;
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
}

export type FetchLike = (url: string, init: FetchInit) => Promise<Response>;

export interface Deps {
  fetch: FetchLike;
  /** null where no edge cache is available (tests, previews). */
  cache: CacheLike | null;
  /** Lets cache writes finish after the response is sent (ctx.waitUntil in the worker). */
  waitUntil: (promise: Promise<unknown>) => void;
  /** Upstream timeout; defaults to 15 s. */
  upstreamTimeoutMs?: number;
  /** Workers AI timeout per call; defaults to 20 s. */
  aiTimeoutMs?: number;
}

export const DEFAULT_MODEL = "anthropic/claude-haiku-5.5";
export const DEFAULT_COACH_MODEL = "anthropic/claude-sonnet-5.5";
/** The examiner (correction + tip); off the voice path, so it may be a little slower than the talk. */
export const DEFAULT_REVIEW_MODEL = "anthropic/claude-sonnet-5.5";
