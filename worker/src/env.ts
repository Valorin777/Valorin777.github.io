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

export interface Env {
  /** Secret: `npx wrangler secret put OPENROUTER_API_KEY`. Never logged, never returned. */
  OPENROUTER_API_KEY?: string;
  /** Comma-separated list of exact origins allowed to call the API from a browser. */
  ALLOWED_ORIGINS?: string;
  /** OpenRouter model id, e.g. "anthropic/claude-haiku-5.5". */
  MODEL?: string;
  LIMITER?: RateLimiter;
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
}

export const DEFAULT_MODEL = "anthropic/claude-haiku-5.5";
