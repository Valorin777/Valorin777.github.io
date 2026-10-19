import {
  explainCacheHash,
  explainCacheRequest,
  explainKvKey,
  readExplainCache,
  readExplainKv,
  writeExplainCache,
  writeExplainKv,
} from "./cache";
import { corsHeaders, isAllowedOrigin, parseAllowedOrigins, preflightHeaders, withExposedHeaders } from "./cors";
import { DEFAULT_COACH_MODEL, type Deps, type Env, type RateLimiter } from "./env";
import { ANSWER_TTL_SECONDS, FALLBACK_ANSWER_TTL_SECONDS, kvPut } from "./kv";
import { completeWithFallback, primaryModel } from "./llm";
import { UpstreamError } from "./openrouter";
import { cleanText, correctionFits, parseCoachOutput } from "./parse";
import { buildCoachMessages, buildExplainMessages, buildTranslateMessages } from "./prompts";
import {
  CoachBodySchema,
  DeviceIdSchema,
  ExplainBodySchema,
  LangSchema,
  LIMITS,
  TranslateBodySchema,
  TtsBodySchema,
  type CoachBody,
  type CoachResponse,
  type ExplainBody,
  type TranslateBody,
  type TranslateResponse,
  type TtsBody,
} from "./schemas";
import { STT_MAX_BYTES, sttContentType, transcribe } from "./stt";
import { parseTranslateOutput, readCachedTranslation, translateCacheKey, translationDirection } from "./translate";
import { synthesize } from "./tts";
import { DEFAULT_VOICE, VOICES } from "./voices";

export const EXPLAIN_MAX_TOKENS = 140;
export const COACH_MAX_TOKENS = 900;
/** Sonnet with a short think plus a tip takes a few seconds; give it room. */
export const COACH_TIMEOUT_MS = 25_000;
export const TRANSLATE_MAX_TOKENS = 900;
export const EXPLAIN_TEMPERATURE = 0.4;
export const COACH_TEMPERATURE = 0.7;
export const TRANSLATE_TEMPERATURE = 0.3;
/** Hard cap after cleaning; the prompt asks for 45 words, this only stops runaway output. */
const EXPLAIN_HARD_MAX_WORDS = 70;

export const AUDIO_CACHE_CONTROL = "public, max-age=31536000, immutable";
/** MeloTTS audio is a stopgap: it should not outlive the outage in any cache. */
export const FALLBACK_AUDIO_CACHE_CONTROL = "public, max-age=86400";
const VOICES_CACHE_CONTROL = "public, max-age=3600";

type HeaderMap = Record<string, string>;
type PostRoute = "/explain" | "/coach" | "/translate" | "/tts" | "/stt";
const POST_ROUTES: readonly string[] = ["/explain", "/coach", "/translate", "/tts", "/stt"];

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
export async function readBytesCapped(request: Request, maxBytes: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array(0);
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
  return bytes;
}

export async function readTextCapped(request: Request, maxBytes: number): Promise<string | null> {
  const bytes = await readBytesCapped(request, maxBytes);
  return bytes === null ? null : new TextDecoder().decode(bytes);
}

type BodyResult = { ok: true; value: unknown } | { ok: false; error: "too-large" | "invalid" };

function declaredTooLarge(request: Request, maxBytes: number): boolean {
  const declared = request.headers.get("Content-Length");
  return declared !== null && Number(declared) > maxBytes;
}

export async function readJsonBody(request: Request, maxBytes: number): Promise<BodyResult> {
  if (declaredTooLarge(request, maxBytes)) return { ok: false, error: "too-large" };
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
  const model = primaryModel(env);
  const hash = await explainCacheHash(model, input.exerciseId, input.given, input.lang);
  const kvKey = explainKvKey(hash);
  const edgeKey = explainCacheRequest(requestUrl, hash);
  // KV when bound (works on *.workers.dev); the Cache API otherwise.
  if (env.TTS_CACHE) {
    const hit = await readExplainKv(env.TTS_CACHE, kvKey);
    if (hit) return jsonResponse(200, { text: hit.text, cached: true }, { ...cors, "X-AI-Model": hit.model ?? model, "X-Cache": "hit" });
  } else {
    const hit = await readExplainCache(deps.cache, edgeKey);
    if (hit) return jsonResponse(200, { text: hit, cached: true }, { ...cors, "X-AI-Model": model, "X-Cache": "hit" });
  }

  const answer = await completeWithFallback(
    env,
    deps,
    { messages: buildExplainMessages(input), maxTokens: EXPLAIN_MAX_TOKENS, temperature: EXPLAIN_TEMPERATURE },
    (raw) => cleanText(raw, { maxWords: EXPLAIN_HARD_MAX_WORDS, bold: true }) || null,
    "/explain",
  );
  const text = answer.value;
  const primary = answer.model === model;
  if (env.TTS_CACHE) {
    const ttl = primary ? ANSWER_TTL_SECONDS : FALLBACK_ANSWER_TTL_SECONDS;
    deps.waitUntil(writeExplainKv(env.TTS_CACHE, kvKey, { text, model: answer.model }, ttl));
  } else if (primary) {
    deps.waitUntil(writeExplainCache(deps.cache, edgeKey, text));
  }
  return jsonResponse(200, { text, cached: false }, { ...cors, "X-AI-Model": answer.model, "X-Cache": "miss" });
}

async function handleCoach(input: CoachBody, env: Env, deps: Deps, cors: HeaderMap): Promise<Response> {
  const ended = input.history.length >= LIMITS.historyMax;
  const coachEnv = { ...env, MODEL: env.COACH_MODEL?.trim() || DEFAULT_COACH_MODEL };
  const answer = await completeWithFallback(
    coachEnv,
    { ...deps, upstreamTimeoutMs: deps.upstreamTimeoutMs ?? COACH_TIMEOUT_MS },
    {
      messages: buildCoachMessages({ ...input, ended }),
      maxTokens: COACH_MAX_TOKENS,
      temperature: COACH_TEMPERATURE,
      json: true,
    },
    parseCoachOutput,
    "/coach",
  );
  const parsed = answer.value;
  const lastUserText = input.history[input.history.length - 1]?.text ?? "";
  const correction =
    parsed.correction && correctionFits(parsed.correction, lastUserText) ? parsed.correction : null;
  const body: CoachResponse = { reply: parsed.reply, correction, tip: parsed.tip, ended };
  return jsonResponse(200, body, { ...cors, "X-AI-Model": answer.model });
}

async function handleTranslate(input: TranslateBody, env: Env, deps: Deps, cors: HeaderMap): Promise<Response> {
  const key = await translateCacheKey(input.to, input.text);
  const hit = await readCachedTranslation(env.TTS_CACHE, key);
  if (hit) {
    const body: TranslateResponse = { translation: hit.translation, from: hit.from, notes: hit.notes };
    return jsonResponse(200, body, { ...cors, "X-AI-Model": hit.model, "X-Cache": "hit" });
  }

  const direction = translationDirection(input.text, input.to);
  const answer = await completeWithFallback(
    env,
    deps,
    {
      messages: buildTranslateMessages(input.text, direction),
      maxTokens: TRANSLATE_MAX_TOKENS,
      temperature: TRANSLATE_TEMPERATURE,
      json: true,
    },
    (raw) => parseTranslateOutput(raw, input.text),
    "/translate",
  );
  const body: TranslateResponse = { translation: answer.value.translation, from: direction.from, notes: answer.value.notes };
  const ttl = answer.model === primaryModel(env) ? ANSWER_TTL_SECONDS : FALLBACK_ANSWER_TTL_SECONDS;
  deps.waitUntil(kvPut(env.TTS_CACHE, key, JSON.stringify({ ...body, model: answer.model }), ttl));
  return jsonResponse(200, body, { ...cors, "X-AI-Model": answer.model, "X-Cache": "miss" });
}

async function handleTts(input: TtsBody, env: Env, deps: Deps, cors: HeaderMap): Promise<Response> {
  const speech = await synthesize(env, deps, input.voice, input.text);
  return new Response(speech.bytes, {
    status: 200,
    headers: {
      "Content-Type": speech.contentType,
      "Cache-Control": speech.fallback ? FALLBACK_AUDIO_CACHE_CONTROL : AUDIO_CACHE_CONTROL,
      "X-TTS-Model": speech.model,
      "X-Cache": speech.cached ? "hit" : "miss",
      "X-Content-Type-Options": "nosniff",
      ...cors,
    },
  });
}

async function handleStt(request: Request, url: URL, env: Env, deps: Deps, cors: HeaderMap): Promise<Response> {
  if (!sttContentType(request.headers.get("Content-Type"))) return jsonResponse(415, { error: "unsupported" }, cors);
  const lang = LangSchema.safeParse(url.searchParams.get("lang") ?? "en");
  if (!lang.success) return jsonResponse(400, { error: "invalid" }, cors);
  if (declaredTooLarge(request, STT_MAX_BYTES)) return jsonResponse(413, { error: "too-large" }, cors);
  const audio = await readBytesCapped(request, STT_MAX_BYTES);
  if (audio === null) return jsonResponse(413, { error: "too-large" }, cors);
  if (audio.byteLength === 0) return jsonResponse(400, { error: "invalid" }, cors);
  const transcript = await transcribe(env.AI, audio, lang.data, deps.aiTimeoutMs);
  return jsonResponse(200, { text: transcript.text }, { ...cors, "X-AI-Model": transcript.model });
}

async function handleJsonRoute(path: PostRoute, value: unknown, env: Env, deps: Deps, requestUrl: string, cors: HeaderMap): Promise<Response> {
  const invalid = (): Response => jsonResponse(400, { error: "invalid" }, cors);
  switch (path) {
    case "/explain": {
      const input = ExplainBodySchema.safeParse(value);
      return input.success ? handleExplain(input.data, env, deps, requestUrl, cors) : invalid();
    }
    case "/coach": {
      const input = CoachBodySchema.safeParse(value);
      return input.success ? handleCoach(input.data, env, deps, cors) : invalid();
    }
    case "/translate": {
      const input = TranslateBodySchema.safeParse(value);
      return input.success ? handleTranslate(input.data, env, deps, cors) : invalid();
    }
    case "/tts": {
      const input = TtsBodySchema.safeParse(value);
      return input.success ? handleTts(input.data, env, deps, cors) : invalid();
    }
    case "/stt":
      return invalid();
  }
}

function isPostRoute(path: string): path is PostRoute {
  return POST_ROUTES.includes(path);
}

async function route(request: Request, env: Env, deps: Deps): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const origin = request.headers.get("Origin");
  const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const cors = withExposedHeaders(corsHeaders(origin, allowed));

  if (request.method === "OPTIONS") {
    if (!isAllowedOrigin(origin, allowed)) return new Response(null, { status: 403, headers: { Vary: "Origin" } });
    return new Response(null, { status: 204, headers: preflightHeaders(origin) });
  }

  if (path === "/health" || path === "/voices") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return jsonResponse(405, { error: "method" }, { ...cors, Allow: "GET, HEAD, OPTIONS" });
    }
    if (path === "/health") return jsonResponse(200, { ok: true, model: primaryModel(env) }, cors);
    return jsonResponse(200, { voices: VOICES, default: DEFAULT_VOICE }, { ...cors, "Cache-Control": VOICES_CACHE_CONTROL });
  }

  if (!isPostRoute(path)) return jsonResponse(404, { error: "not-found" }, cors);
  if (request.method !== "POST") return jsonResponse(405, { error: "method" }, { ...cors, Allow: "POST, OPTIONS" });
  if (!isAllowedOrigin(origin, allowed)) return jsonResponse(403, { error: "forbidden" }, cors);

  const deviceId = DeviceIdSchema.safeParse(request.headers.get("X-Device-Id"));
  if (!deviceId.success) return jsonResponse(400, { error: "invalid" }, cors);

  const audioRoute = path === "/tts" || path === "/stt";
  const ip = request.headers.get("CF-Connecting-IP") ?? "";
  const rate = await checkRateLimit(audioRoute ? env.TTS_LIMITER : env.LIMITER, deviceId.data, ip);
  if (rate === "unconfigured") {
    console.error(`${audioRoute ? "TTS_LIMITER" : "LIMITER"} binding is missing`);
    return jsonResponse(503, { error: "unavailable" }, cors);
  }
  if (rate === "limited") return jsonResponse(429, { error: "rate-limit" }, { ...cors, "Retry-After": "60" });

  try {
    if (path === "/stt") return await handleStt(request, url, env, deps, cors);
    const body = await readJsonBody(request, LIMITS.bodyBytes);
    if (!body.ok) return jsonResponse(body.error === "too-large" ? 413 : 400, { error: body.error }, cors);
    return await handleJsonRoute(path, body.value, env, deps, request.url, cors);
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
