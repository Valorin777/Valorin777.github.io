/**
 * Browser client for the AI worker (worker/, "b2-sprint-ai"). GitHub Pages is static, so every
 * AI call goes to the worker, which holds the OpenRouter key. With NEXT_PUBLIC_AI_URL unset the
 * AI features are simply off: aiEnabled() is false and calls reject with AiError("disabled").
 */

export function trimBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export const AI_URL: string = trimBaseUrl(process.env.NEXT_PUBLIC_AI_URL ?? "");

export function aiEnabled(): boolean {
  return AI_URL !== "";
}

export type AiErrorKind = "disabled" | "offline" | "rate-limit" | "timeout" | "unavailable";

export class AiError extends Error {
  readonly kind: AiErrorKind;

  constructor(kind: AiErrorKind, message?: string) {
    super(message ?? `AI ${kind}`);
    this.name = "AiError";
    this.kind = kind;
  }
}

export interface ExplainInput {
  exerciseId: string;
  task: string;
  given: string;
  right: string;
  rule: string;
  category: string;
  lang: "en" | "ru";
}

export interface ExplainResult {
  text: string;
  cached: boolean;
}

export interface CoachTurn {
  role: "user" | "assistant";
  text: string;
}

export interface CoachCorrection {
  wrong: string;
  right: string;
  why: string;
}

/** A short tense trick the coach adds to a turn (shown as a card, not read aloud). */
export interface CoachTip {
  title: string;
  text: string;
  ru?: string;
  examples?: string[];
}

export interface CoachReply {
  reply: string;
  correction: CoachCorrection | null;
  tip: CoachTip | null;
  ended: boolean;
}

export interface CoachInput {
  history: CoachTurn[];
  scenario: string;
  focus: string[];
  level: "B1" | "B2";
  /** Titles of tips already shown, so the coach never repeats one. */
  tipsSeen?: string[];
}

/** Must match the worker's Zod caps (worker/src/schemas.ts); longer input is cut, not rejected. */
export const AI_LIMITS = {
  exerciseId: 80,
  task: 400,
  given: 200,
  right: 200,
  rule: 160,
  category: 40,
  turnText: 400,
  historyMax: 30,
  scenario: 60,
  focusItems: 6,
  focusItem: 40,
  translateText: 600,
  ttsText: 300,
} as const;

export const EXPLAIN_TIMEOUT_MS = 12_000;
export const COACH_TIMEOUT_MS = 20_000;
export const TRANSLATE_TIMEOUT_MS = 15_000;
export const VOICES_TIMEOUT_MS = 8_000;
export const CACHE_PREFIX = "b2sprint:ai:";
export const CACHE_MAX_ENTRIES = 200;
export const TRANSLATE_CACHE_PREFIX = "b2sprint:tr:";
export const TRANSLATE_CACHE_MAX_ENTRIES = 300;
export const VOICES_KEY = "b2sprint:voices";
export const VOICES_TTL_MS = 24 * 60 * 60 * 1000;
export const DEVICE_KEY = "b2sprint:device";

export type AiPath = "/explain" | "/coach" | "/health" | "/translate" | "/voices" | "/tts" | "/stt";

export function buildUrl(base: string, path: AiPath): string {
  return `${trimBaseUrl(base)}${path}`;
}

// ---------- error mapping ----------

export function errorKindForStatus(status: number): AiErrorKind {
  return status === 429 ? "rate-limit" : "unavailable";
}

export function errorKindForFailure(failure: { timedOut: boolean; offline: boolean }): AiErrorKind {
  if (failure.timedOut) return "timeout";
  if (failure.offline) return "offline";
  return "unavailable";
}

export function isOffline(nav: { onLine?: boolean } | undefined): boolean {
  return nav?.onLine === false;
}

function currentNavigator(): { onLine?: boolean } | undefined {
  return typeof navigator === "undefined" ? undefined : navigator;
}

// ---------- input clamping ----------

function cut(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

export function clampExplainInput(input: ExplainInput): ExplainInput {
  return {
    exerciseId: cut(input.exerciseId, AI_LIMITS.exerciseId),
    task: cut(input.task, AI_LIMITS.task),
    given: cut(input.given, AI_LIMITS.given),
    right: cut(input.right, AI_LIMITS.right),
    rule: cut(input.rule, AI_LIMITS.rule),
    category: cut(input.category, AI_LIMITS.category),
    lang: input.lang,
  };
}

/** Keeps the last 16 non-empty turns and cuts every text to the worker's limits. */
export function clampCoachInput(input: CoachInput): CoachInput {
  const history = input.history
    .map((turn) => ({ role: turn.role, text: cut(turn.text.trim(), AI_LIMITS.turnText) }))
    .filter((turn) => turn.text.length > 0)
    .slice(-AI_LIMITS.historyMax);
  const focus = input.focus
    .map((item) => cut(item.trim(), AI_LIMITS.focusItem))
    .filter((item) => item.length > 0)
    .slice(0, AI_LIMITS.focusItems);
  const tipsSeen = (input.tipsSeen ?? [])
    .map((t) => cut(t.trim(), 80))
    .filter((t) => t.length > 0)
    .slice(-20);
  return {
    history,
    scenario: cut(input.scenario.trim(), AI_LIMITS.scenario),
    focus,
    level: input.level,
    ...(tipsSeen.length ? { tipsSeen } : {}),
  };
}

// ---------- response parsing ----------

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseExplainResponse(data: unknown): ExplainResult | null {
  if (!isRecord(data) || typeof data.text !== "string" || data.text.trim() === "") return null;
  return { text: data.text, cached: data.cached === true };
}

export function parseCoachResponse(data: unknown): CoachReply | null {
  if (!isRecord(data) || typeof data.reply !== "string" || data.reply.trim() === "") return null;
  let correction: CoachCorrection | null = null;
  const c = data.correction;
  if (isRecord(c) && typeof c.wrong === "string" && typeof c.right === "string" && typeof c.why === "string") {
    correction = { wrong: c.wrong, right: c.right, why: c.why };
  }
  let tip: CoachTip | null = null;
  const t = data.tip;
  if (isRecord(t) && typeof t.title === "string" && typeof t.text === "string" && t.title.trim() && t.text.trim()) {
    const examples = Array.isArray(t.examples) ? t.examples.filter((e): e is string => typeof e === "string").slice(0, 3) : [];
    tip = {
      title: t.title,
      text: t.text,
      ...(typeof t.ru === "string" && t.ru.trim() ? { ru: t.ru } : {}),
      ...(examples.length ? { examples } : {}),
    };
  }
  return { reply: data.reply, correction, tip, ended: data.ended === true };
}

// ---------- local explanation cache ----------

/** Same idea as the worker's cache key: case, spacing, curly quotes and final punctuation do not matter. */
export function normalizeGiven(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?…]+$/, "")
    .trim();
}

/** cyrb53: a fast 53-bit string hash, plenty for a 200-entry cache. Base-36 output. */
export function smallHash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function explainCacheKey(input: Pick<ExplainInput, "exerciseId" | "given" | "lang">): string {
  return CACHE_PREFIX + smallHash(`${input.exerciseId}|${normalizeGiven(input.given)}|${input.lang}`);
}

export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface CacheEntry {
  /** Last use, epoch ms. */
  t: number;
  text: string;
}

function parseEntry(raw: string | null): CacheEntry | null {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (isRecord(value) && typeof value.t === "number" && typeof value.text === "string" && value.text !== "") {
      return { t: value.t, text: value.text };
    }
  } catch {
    // Corrupt entry: treated as a miss and overwritten on the next write.
  }
  return null;
}

/** Oldest-used keys to delete so that at most `max` entries remain. */
export function selectEvictions(entries: ReadonlyArray<{ key: string; t: number }>, max: number): string[] {
  if (entries.length <= max) return [];
  return [...entries]
    .sort((a, b) => a.t - b.t || a.key.localeCompare(b.key))
    .slice(0, entries.length - max)
    .map((entry) => entry.key);
}

/** Returns the cached text and marks it as recently used. */
export function readCachedExplain(storage: StorageLike, key: string, nowMs: number): string | null {
  try {
    const entry = parseEntry(storage.getItem(key));
    if (!entry) return null;
    storage.setItem(key, JSON.stringify({ t: nowMs, text: entry.text } satisfies CacheEntry));
    return entry.text;
  } catch {
    return null;
  }
}

export function writeCachedExplain(
  storage: StorageLike,
  key: string,
  text: string,
  nowMs: number,
  max: number = CACHE_MAX_ENTRIES,
): void {
  writeCachedText(storage, CACHE_PREFIX, key, text, nowMs, max);
}

/** LRU write shared by the explanation and translation caches; eviction counts only `prefix` keys. */
function writeCachedText(
  storage: StorageLike,
  prefix: string,
  key: string,
  text: string,
  nowMs: number,
  max: number,
): void {
  try {
    storage.setItem(key, JSON.stringify({ t: nowMs, text } satisfies CacheEntry));
    const entries: Array<{ key: string; t: number }> = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k === null || !k.startsWith(prefix)) continue;
      entries.push({ key: k, t: parseEntry(storage.getItem(k))?.t ?? 0 });
    }
    for (const stale of selectEvictions(entries, max)) storage.removeItem(stale);
  } catch {
    // Storage full or blocked: the answer still reaches the learner, just uncached.
  }
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

// ---------- device id ----------

export function isDeviceId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/.test(value);
}

/** RFC 4122 v4 layout from any random source; used where crypto.randomUUID is missing (http LAN). */
export function fallbackUuid(random: () => number): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = Math.floor(random() * 16) & 15;
    return (ch === "x" ? r : (r & 3) | 8).toString(16);
  });
}

export function newDeviceId(random: () => number = Math.random): string {
  const c: { randomUUID?: () => string } | undefined = typeof crypto === "undefined" ? undefined : crypto;
  if (c && typeof c.randomUUID === "function") {
    try {
      return c.randomUUID();
    } catch {
      // Insecure context in some browsers: fall through.
    }
  }
  return fallbackUuid(random);
}

let sessionDeviceId: string | null = null;

/** Stable anonymous id for rate limiting, kept in localStorage ("b2sprint:device"). */
export function deviceId(): string {
  const storage = browserStorage();
  try {
    const saved = storage?.getItem(DEVICE_KEY) ?? null;
    if (saved !== null && isDeviceId(saved)) return saved;
  } catch {
    // Blocked storage: keep an in-memory id for this page session.
  }
  sessionDeviceId = sessionDeviceId ?? newDeviceId();
  try {
    storage?.setItem(DEVICE_KEY, sessionDeviceId);
  } catch {
    // Same as above.
  }
  return sessionDeviceId;
}

// ---------- transport ----------

export function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

/** Lets one caller stop waiting for a shared promise without cancelling it for the others. */
export function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(abortReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export interface AiRequestInit {
  method?: "GET" | "POST";
  /** POST body sent as JSON (ignored when `body` is set). */
  json?: unknown;
  /** Raw POST body (audio upload), sent with `contentType`. */
  body?: Blob;
  contentType?: string;
  query?: Record<string, string>;
  timeoutMs: number;
  signal?: AbortSignal;
}

/**
 * One request to the worker; `read` parses the OK response inside the same timeout. Rejects with
 * AiError, except when the caller's own signal aborts: then the abort reason is rethrown untouched
 * so the UI can ignore it. GETs carry no custom headers, so they need no CORS preflight.
 */
export async function aiRequest<T>(
  path: AiPath,
  init: AiRequestInit,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  const { signal } = init;
  if (signal?.aborted) throw abortReason(signal);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, init.timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const method = init.method ?? "POST";
  const query = init.query ? `?${new URLSearchParams(init.query).toString()}` : "";
  let headers: Record<string, string> | undefined;
  let body: BodyInit | undefined;
  if (method === "POST") {
    if (init.body !== undefined) {
      headers = { "Content-Type": init.contentType ?? init.body.type, "X-Device-Id": deviceId() };
      body = init.body;
    } else {
      headers = { "Content-Type": "application/json", "X-Device-Id": deviceId() };
      body = JSON.stringify(init.json ?? {});
    }
  }
  try {
    const response = await fetch(`${buildUrl(AI_URL, path)}${query}`, {
      method,
      headers,
      body,
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store",
    });
    if (!response.ok) throw new AiError(errorKindForStatus(response.status), `AI request failed (${response.status})`);
    return await read(response);
  } catch (error) {
    if (error instanceof AiError) throw error;
    if (signal?.aborted && !timedOut) throw abortReason(signal);
    throw new AiError(errorKindForFailure({ timedOut, offline: isOffline(currentNavigator()) }));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function postJson(path: AiPath, body: unknown, timeoutMs: number, signal?: AbortSignal): Promise<unknown> {
  return aiRequest(path, { json: body, timeoutMs, signal }, (response) => response.json() as Promise<unknown>);
}

// ---------- translation ----------

export type TranslateTarget = "ru" | "en" | "auto";

export interface TranslateInput {
  text: string;
  to: TranslateTarget;
}

export interface TranslateNote {
  phrase: string;
  meaning: string;
}

export interface TranslateResult {
  translation: string;
  from: "en" | "ru";
  notes: TranslateNote[];
}

/** Case and final punctuation stay: "Really?" and "really." can translate differently. */
export function normalizeTranslateText(text: string): string {
  return (text || "")
    .normalize("NFKC")
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function detectLang(text: string): "en" | "ru" {
  return /[а-яё]/i.test(text) ? "ru" : "en";
}

export function translateCacheKey(input: TranslateInput): string {
  return TRANSLATE_CACHE_PREFIX + smallHash(`${input.to}|${normalizeTranslateText(input.text)}`);
}

export function parseTranslateResponse(data: unknown, sourceText = ""): TranslateResult | null {
  if (!isRecord(data) || typeof data.translation !== "string" || data.translation.trim() === "") return null;
  const from = data.from === "en" || data.from === "ru" ? data.from : detectLang(sourceText);
  const notes: TranslateNote[] = [];
  if (Array.isArray(data.notes)) {
    for (const note of data.notes) {
      if (!isRecord(note) || typeof note.phrase !== "string" || typeof note.meaning !== "string") continue;
      if (!note.phrase.trim() || !note.meaning.trim()) continue;
      notes.push({ phrase: note.phrase, meaning: note.meaning });
    }
  }
  return { translation: data.translation, from, notes: notes.slice(0, 8) };
}

function readCachedTranslation(storage: StorageLike, key: string, source: string): TranslateResult | null {
  const raw = readCachedExplain(storage, key, Date.now());
  if (raw === null) return null;
  try {
    return parseTranslateResponse(JSON.parse(raw) as unknown, source);
  } catch {
    return null;
  }
}

// ---------- natural voices ----------

export interface VoiceInfo {
  id: string;
  label: string;
  accent: string;
  gender: "female" | "male";
}

export interface VoiceList {
  voices: VoiceInfo[];
  default: string;
}

/** Used before the worker answers, offline, or when it is down. Ids match the worker's catalogue. */
export const FALLBACK_VOICES: VoiceInfo[] = [
  { id: "a1-asteria", label: "Asteria · US", accent: "US", gender: "female" },
  { id: "a1-luna", label: "Luna · US", accent: "US", gender: "female" },
  { id: "a1-athena", label: "Athena · UK", accent: "UK", gender: "female" },
  { id: "a1-helios", label: "Helios · UK", accent: "UK", gender: "male" },
  { id: "a1-orion", label: "Orion · US", accent: "US", gender: "male" },
  { id: "a1-arcas", label: "Arcas · US", accent: "US", gender: "male" },
];

export const FALLBACK_VOICE_LIST: VoiceList = { voices: FALLBACK_VOICES, default: "a1-asteria" };

export function isVoiceId(value: string): boolean {
  return /^[a-z0-9][a-z0-9_.-]{0,63}$/i.test(value);
}

export function parseVoicesResponse(data: unknown): VoiceList | null {
  if (!isRecord(data) || !Array.isArray(data.voices)) return null;
  const voices: VoiceInfo[] = [];
  for (const item of data.voices) {
    if (!isRecord(item) || typeof item.id !== "string" || !isVoiceId(item.id)) continue;
    if (item.gender !== "female" && item.gender !== "male") continue;
    if (voices.some((voice) => voice.id === item.id)) continue;
    const label = typeof item.label === "string" && item.label.trim() ? item.label.trim() : item.id;
    const accent = typeof item.accent === "string" ? item.accent : "";
    voices.push({ id: item.id, label, accent, gender: item.gender });
  }
  const first = voices[0];
  if (!first) return null;
  const fallbackDefault = first.id;
  const preferred = typeof data.default === "string" ? data.default : "";
  return { voices, default: voices.some((voice) => voice.id === preferred) ? preferred : fallbackDefault };
}

interface StoredVoices {
  t: number;
  list: VoiceList;
}

let voicesMemo: StoredVoices | null = null;
let voicesInFlight: Promise<VoiceList> | null = null;

function readStoredVoices(storage: StorageLike | null): StoredVoices | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(VOICES_KEY);
    if (raw === null) return null;
    const value = JSON.parse(raw) as unknown;
    if (!isRecord(value) || typeof value.t !== "number") return null;
    const list = parseVoicesResponse(value);
    return list ? { t: value.t, list } : null;
  } catch {
    return null;
  }
}

function storeVoices(storage: StorageLike | null, entry: StoredVoices): void {
  voicesMemo = entry;
  try {
    storage?.setItem(VOICES_KEY, JSON.stringify({ t: entry.t, ...entry.list }));
  } catch {
    // Kept in memory for this page session.
  }
}

async function loadVoiceList(storage: StorageLike | null, known: StoredVoices | null): Promise<VoiceList> {
  try {
    const data = await aiRequest("/voices", { method: "GET", timeoutMs: VOICES_TIMEOUT_MS }, (response) =>
      response.json() as Promise<unknown>,
    );
    const list = parseVoicesResponse(data);
    if (!list) return known?.list ?? FALLBACK_VOICE_LIST;
    storeVoices(storage, { t: Date.now(), list });
    return list;
  } catch {
    return known?.list ?? FALLBACK_VOICE_LIST;
  }
}

// ---------- public API ----------

/** Why the learner's answer is wrong, in one or two short sentences (en or ru). */
export async function explain(input: ExplainInput, signal?: AbortSignal): Promise<ExplainResult> {
  if (!aiEnabled()) throw new AiError("disabled");
  const key = explainCacheKey(input);
  const storage = browserStorage();
  const hit = storage ? readCachedExplain(storage, key, Date.now()) : null;
  if (hit !== null) return { text: hit, cached: true };
  if (isOffline(currentNavigator())) throw new AiError("offline");
  const data = await postJson("/explain", clampExplainInput(input), EXPLAIN_TIMEOUT_MS, signal);
  const result = parseExplainResponse(data);
  if (!result) throw new AiError("unavailable", "Unexpected AI response");
  if (storage) writeCachedExplain(storage, key, result.text, Date.now());
  return result;
}

/** One turn of the voice coach. Not cached: every turn is a new conversation state. */
export async function coach(input: CoachInput, signal?: AbortSignal): Promise<CoachReply> {
  if (!aiEnabled()) throw new AiError("disabled");
  if (isOffline(currentNavigator())) throw new AiError("offline");
  const data = await postJson("/coach", clampCoachInput(input), COACH_TIMEOUT_MS, signal);
  const reply = parseCoachResponse(data);
  if (!reply) throw new AiError("unavailable", "Unexpected AI response");
  return reply;
}

/**
 * Translation with short notes on idioms and collocations. `to: "auto"` lets the worker pick
 * (Russian → English, English → Russian). Served from localStorage when seen before.
 */
export async function translate(input: TranslateInput, signal?: AbortSignal): Promise<TranslateResult> {
  if (!aiEnabled()) throw new AiError("disabled");
  const text = cut(normalizeTranslateText(input.text), AI_LIMITS.translateText);
  if (!text) throw new AiError("unavailable", "Nothing to translate");
  const key = translateCacheKey({ text, to: input.to });
  const storage = browserStorage();
  const hit = storage ? readCachedTranslation(storage, key, text) : null;
  if (hit) return hit;
  if (isOffline(currentNavigator())) throw new AiError("offline");
  const data = await postJson("/translate", { text, to: input.to }, TRANSLATE_TIMEOUT_MS, signal);
  const result = parseTranslateResponse(data, text);
  if (!result) throw new AiError("unavailable", "Unexpected AI response");
  if (storage) {
    writeCachedText(storage, TRANSLATE_CACHE_PREFIX, key, JSON.stringify(result), Date.now(), TRANSLATE_CACHE_MAX_ENTRIES);
  }
  return result;
}

/**
 * The worker's natural voices, cached for a day (memory + localStorage). Never fails for network
 * reasons: offline or with the worker down it returns the last list seen, else FALLBACK_VOICES.
 * Rejects only when AI is off (AiError "disabled") or the caller aborts.
 */
export async function fetchVoices(signal?: AbortSignal): Promise<VoiceList> {
  if (!aiEnabled()) throw new AiError("disabled");
  if (signal?.aborted) throw abortReason(signal);
  const storage = browserStorage();
  const known = voicesMemo ?? readStoredVoices(storage);
  if (known) voicesMemo = known;
  const now = Date.now();
  if (known && known.t <= now && now - known.t < VOICES_TTL_MS) return known.list;
  if (isOffline(currentNavigator())) return known?.list ?? FALLBACK_VOICE_LIST;
  if (!voicesInFlight) {
    voicesInFlight = loadVoiceList(storage, known).finally(() => {
      voicesInFlight = null;
    });
  }
  return signal ? withAbort(voicesInFlight, signal) : voicesInFlight;
}
