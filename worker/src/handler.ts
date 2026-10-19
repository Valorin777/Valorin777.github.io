import { explainCacheHash, explainCacheRequest, readExplainCache, writeExplainCache } from "./cache";
import { corsHeaders, isAllowedOrigin, parseAllowedOrigins, preflightHeaders } from "./cors";
import { DEFAULT_MODEL, type Deps, type Env, type RateLimiter } from "./env";
import { complete, UpstreamError } from "./openrouter";
import { cleanText, correctionFits, parseCoachOutput } from "./parse";
import { buildCoachMessages, buildExplainMessages } from "./prompts";
import {
  CoachBodySchema,
  DeviceIdSchema,
  ExplainBodySchema,
  LIMITS,
  type CoachBody,
  type CoachResponse,
  type ExplainBody,
} from "./schemas";

export const EXPLAIN_MAX_TOKENS = 140;
export const COACH_MAX_TOKENS = 220;
export const EXPLAIN_TEMPERATURE = 0.4;
export const COACH_TEMPERATURE = 0.7;
/** Hard cap after cleaning; the prompt asks for 45 words, this only stops runaway output. */
const EXPLAIN_HARD_MAX_WORDS = 70;

type HeaderMap = Record<string, string>;

export function jsonResponse(status: number, body: unknown, headers: HeaderMap = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

/** Reads at most maxBytes; null when the body is larger (the rest is never buffered). */
export async function readTextCapped(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk: Uint8Array = value;
    total += chunk.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

type BodyResult = { ok: true; value: unknown } | { ok: false; error: "too-large" | "invalid" };

export async function readJsonBody(request: Request, maxBytes: number): Promise<BodyResult> {
  const declared = request.headers.get("Content-Length");
  if (declared !== null && Number(declared) > maxBytes) return { ok: false, error: "too-large" };
  const text = await readTextCapped(request, maxBytes);
  if (text === null) return { ok: false, error: "too-large" };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: "invalid" };
  }
}

type RateDecision = "ok" | "limited" | "unconfigured";

/** Two buckets on one binding: this device on this IP, and the whole IP. Fails closed. */
export async function checkRateLimit(
  limiter: RateLimiter | undefined,
  deviceId: string,
  ip: string,
): Promise<RateDecision> {
  if (!limiter) return "unconfigured";
  try {
    const [device, network] = await Promise.all([
      limiter.limit({ key: `${deviceId}:${ip}` }),
      limiter.limit({ key: `ip:${ip}` }),
    ]);
    return device.success && network.success ? "ok" : "limited";
  } catch {
    return "limited";
  }
}

async function handleExplain(input: ExplainBody, env: Env, deps: Deps, requestUrl: string, cors: HeaderMap): Promise<Response> {
  const model = env.MODEL?.trim() || DEFAULT_MODEL;
  const hash = await explainCacheHash(model, input.exerciseId, input.given, input.lang);
  const cacheKey = explainCacheRequest(requestUrl, hash);
  const hit = await readExplainCache(deps.cache, cacheKey);
  if (hit) return jsonResponse(200, { text: hit, cached: true }, cors);

  const raw = await complete(
    env,
    { messages: buildExplainMessages(input), maxTokens: EXPLAIN_MAX_TOKENS, temperature: EXPLAIN_TEMPERATURE },
    deps.fetch,
    deps.upstreamTimeoutMs,
  );
  const text = cleanText(raw, { maxWords: EXPLAIN_HARD_MAX_WORDS, bold: true });
  if (!text) throw new UpstreamError("empty");
  deps.waitUntil(writeExplainCache(deps.cache, cacheKey, text));
  return jsonResponse(200, { text, cached: false }, cors);
}

async function handleCoach(input: CoachBody, env: Env, deps: Deps, cors: HeaderMap): Promise<Response> {
  const ended = input.history.length >= LIMITS.historyMax;
  const raw = await complete(
    env,
    {
      messages: buildCoachMessages({ ...input, ended }),
      maxTokens: COACH_MAX_TOKENS,
      temperature: COACH_TEMPERATURE,
      json: true,
    },
    deps.fetch,
    deps.upstreamTimeoutMs,
  );
  const parsed = parseCoachOutput(raw);
  if (!parsed) throw new UpstreamError("empty");
  const lastUserText = input.history[input.history.length - 1]?.text ?? "";
  const correction =
    parsed.correction && correctionFits(parsed.correction, lastUserText) ? parsed.correction : null;
  const body: CoachResponse = { reply: parsed.reply, correction, ended };
  return jsonResponse(200, body, cors);
}

async function route(request: Request, env: Env, deps: Deps): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const origin = request.headers.get("Origin");
  const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const cors = corsHeaders(origin, allowed);

  if (request.method === "OPTIONS") {
    if (!isAllowedOrigin(origin, allowed)) return new Response(null, { status: 403, headers: { Vary: "Origin" } });
    return new Response(null, { status: 204, headers: preflightHeaders(origin) });
  }

  if (path === "/health") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return jsonResponse(405, { error: "method" }, { ...cors, Allow: "GET, HEAD, OPTIONS" });
    }
    return jsonResponse(200, { ok: true, model: env.MODEL?.trim() || DEFAULT_MODEL }, cors);
  }

  if (path !== "/explain" && path !== "/coach") return jsonResponse(404, { error: "not-found" }, cors);
  if (request.method !== "POST") return jsonResponse(405, { error: "method" }, { ...cors, Allow: "POST, OPTIONS" });
  if (!isAllowedOrigin(origin, allowed)) return jsonResponse(403, { error: "forbidden" }, cors);

  const deviceId = DeviceIdSchema.safeParse(request.headers.get("X-Device-Id"));
  if (!deviceId.success) return jsonResponse(400, { error: "invalid" }, cors);

  const ip = request.headers.get("CF-Connecting-IP") ?? "";
  const rate = await checkRateLimit(env.LIMITER, deviceId.data, ip);
  if (rate === "unconfigured") {
    console.error("LIMITER binding is missing");
    return jsonResponse(503, { error: "unavailable" }, cors);
  }
  if (rate === "limited") return jsonResponse(429, { error: "rate-limit" }, { ...cors, "Retry-After": "60" });

  const body = await readJsonBody(request, LIMITS.bodyBytes);
  if (!body.ok) return jsonResponse(body.error === "too-large" ? 413 : 400, { error: body.error }, cors);

  try {
    if (path === "/explain") {
      const input = ExplainBodySchema.safeParse(body.value);
      if (!input.success) return jsonResponse(400, { error: "invalid" }, cors);
      return await handleExplain(input.data, env, deps, request.url, cors);
    }
    const input = CoachBodySchema.safeParse(body.value);
    if (!input.success) return jsonResponse(400, { error: "invalid" }, cors);
    return await handleCoach(input.data, env, deps, cors);
  } catch (error) {
    if (error instanceof UpstreamError) {
      // Reason and status only: never the key, the prompt or the learner's text.
      console.warn(`upstream failure on ${path}: ${error.reason}${error.status === null ? "" : ` ${error.status}`}`);
      return jsonResponse(502, { error: "upstream" }, cors);
    }
    throw error;
  }
}

export async function handleRequest(request: Request, env: Env, deps: Deps): Promise<Response> {
  try {
    return await route(request, env, deps);
  } catch (error) {
    console.error(`unhandled ${error instanceof Error ? error.name : "error"}`);
    const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
    return jsonResponse(500, { error: "internal" }, corsHeaders(request.headers.get("Origin"), allowed));
  }
}
