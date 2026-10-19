import type { CacheLike, Env } from "./env";
import { handleRequest } from "./handler";

interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

/** caches.default exists only in the Workers runtime; typed loosely so the app's tsconfig accepts it. */
function edgeCache(): CacheLike | null {
  const scope = globalThis as unknown as { caches?: { default?: CacheLike } };
  return scope.caches?.default ?? null;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContextLike): Promise<Response> {
    return handleRequest(request, env, {
      // Wrapped: calling the global fetch with another `this` throws "Illegal invocation" in Workers.
      fetch: (url, init) => fetch(url, init),
      cache: edgeCache(),
      waitUntil: (promise) => ctx.waitUntil(promise),
    });
  },
};

// The Workers runtime requires a default export.
export default worker;
