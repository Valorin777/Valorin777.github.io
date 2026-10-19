/**
 * Natural (neural) voice: audio clips from the worker's /tts, kept in Cache Storage and played
 * through one shared <audio> element. SSR-safe; lib/speech.ts decides when to use it and falls
 * back to the device voice. speakNeural follows the speech.ts contract: onEnd fires exactly once.
 */

import recordings from "@/content/audio-manifest.json";
import { audioKey } from "@/lib/audioKey";
import { BASE_PATH } from "@/lib/constants";
import {
  AI_LIMITS,
  AI_URL,
  AiError,
  aiEnabled,
  aiRequest,
  isOffline,
  smallHash,
  withAbort,
  type AiErrorKind,
} from "@/lib/ai";

export const TTS_CACHE_NAME = "b2-tts-v1";
const recorded = new Set<string>(recordings.keys);
export const TTS_MAX_CHARS: number = AI_LIMITS.ttsText;
export const TTS_TIMEOUT_MS = 15_000;
/** Cache Storage entries kept (oldest dropped first); a sentence is roughly 15–40 KB of MP3. */
export const TTS_CACHE_MAX_ENTRIES = 400;
export const PREFETCH_CONCURRENCY = 2;
const PREFETCH_MAX_QUEUE = 40;
/** A clip that has not started this long after play() is treated as failed. */
const PLAY_START_TIMEOUT_MS = 8000;

function currentNavigator(): { onLine?: boolean } | undefined {
  return typeof navigator === "undefined" ? undefined : navigator;
}

export function neuralAvailable(): boolean {
  if (!aiEnabled() || typeof window === "undefined" || typeof Audio === "undefined") return false;
  return !isOffline(currentNavigator());
}

export function clampRate(rate: number | undefined): number {
  if (typeof rate !== "number" || !Number.isFinite(rate)) return 1;
  return Math.min(1.2, Math.max(0.6, rate));
}

/* ---------------------------------------------------------------- text prep */

/** What the cache key and the request use; spelling and case stay (they change pronunciation). */
export function normalizeSpeechText(text: string): string {
  return (text || "")
    .normalize("NFKC")
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Cuts at the last space that fits; a single word longer than `max` is cut hard. */
export function truncateAtWord(text: string, max: number = TTS_MAX_CHARS): string {
  if (text.length <= max) return text;
  const space = text.lastIndexOf(" ", max);
  return (space > 0 ? text.slice(0, space) : text.slice(0, max)).trim();
}

/** Text → pieces of at most `max` chars, split between sentences where possible. Lossless. */
export function speechChunks(text: string, max: number = TTS_MAX_CHARS): string[] {
  const clean = normalizeSpeechText(text);
  if (!clean) return [];
  if (clean.length <= max) return [clean];
  const sentences = clean.replace(/([.!?…]+["')\]]*) /g, "$1\u0000").split("\u0000");
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    let rest = sentence.trim();
    while (rest) {
      const piece = truncateAtWord(rest, max);
      rest = rest.slice(piece.length).trim();
      if (!current) current = piece;
      else if (current.length + 1 + piece.length <= max) current = `${current} ${piece}`;
      else {
        chunks.push(current);
        current = piece;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Synthetic GET URL that keys a clip in Cache Storage (never fetched over the network). */
export function ttsCacheUrl(voice: string, text: string, base: string = AI_URL): string {
  return `${base}/tts-cache/${encodeURIComponent(voice)}/${smallHash(normalizeSpeechText(text))}`;
}

/* ------------------------------------------------------------------ fetching */

let neuralRequested = false;
const inflight = new Map<string, Promise<Blob>>();

async function openCache(): Promise<Cache | null> {
  try {
    if (typeof caches === "undefined") return null;
    return await caches.open(TTS_CACHE_NAME);
  } catch {
    // Insecure context or blocked storage: play uncached.
    return null;
  }
}

async function readCached(cache: Cache | null, key: string): Promise<Blob | null> {
  if (!cache) return null;
  try {
    const hit = await cache.match(key);
    if (!hit) return null;
    const blob = await hit.blob();
    return blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

async function trimCache(cache: Cache): Promise<void> {
  try {
    const keys = await cache.keys();
    // keys() keeps insertion order, so the head is the oldest.
    for (const request of keys.slice(0, Math.max(0, keys.length - TTS_CACHE_MAX_ENTRIES))) {
      await cache.delete(request);
    }
  } catch {
    // ignore
  }
}

async function storeClip(cache: Cache | null, key: string, blob: Blob): Promise<void> {
  if (!cache) return;
  try {
    await cache.put(key, new Response(blob, { headers: { "Content-Type": blob.type || "audio/mpeg" } }));
    void trimCache(cache);
  } catch {
    // Quota or private mode: the clip still plays.
  }
}

async function loadClip(key: string, text: string, voice: string): Promise<Blob> {
  const cache = await openCache();
  const hit = await readCached(cache, key);
  if (hit) return hit;
  if (isOffline(currentNavigator())) throw new AiError("offline");
  const blob = await aiRequest("/tts", { json: { text, voice }, timeoutMs: TTS_TIMEOUT_MS }, async (response) => {
    const type = (response.headers.get("Content-Type") ?? "").toLowerCase();
    if (type && !type.startsWith("audio/") && !type.startsWith("application/octet-stream")) {
      throw new AiError("unavailable", "Unexpected TTS response");
    }
    const data = await response.blob();
    if (data.size === 0) throw new AiError("unavailable", "Empty audio");
    return data.type.startsWith("audio/") ? data : new Blob([data], { type: "audio/mpeg" });
  });
  await storeClip(cache, key, blob);
  return blob;
}

/**
 * The clip for `text` in `voice`: from Cache Storage, else POST /tts (then stored). Concurrent
 * calls for the same clip share one request; aborting `signal` only stops this caller waiting.
 * Rejects with AiError (or the caller's abort reason).
 */
/**
 * Lesson lines are recorded ahead of time (scripts/build-audio.ts) and shipped with the site,
 * so they play instantly, offline, and cost nothing. Returns the file URL or null.
 */
export function recordedUrl(text: string, voice: string): string | null {
  if (voice !== recordings.voice) return null;
  const key = audioKey(text, voice);
  return recorded.has(key) ? `${BASE_PATH}/audio/${key}.m4a` : null;
}

async function loadRecorded(url: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new AiError("unavailable", `recording ${res.status}`);
  return res.blob();
}

export async function fetchSpeech(text: string, voice: string, signal?: AbortSignal): Promise<Blob> {
  const file = recordedUrl(text, voice);
  if (file) {
    try {
      return await loadRecorded(file, signal);
    } catch (e) {
      if (signal?.aborted) throw e;
      // fall through to the server voice
    }
  }
  if (!aiEnabled()) throw new AiError("disabled");
  neuralRequested = true;
  const clean = truncateAtWord(normalizeSpeechText(text));
  if (!clean || !voice) throw new AiError("unavailable", "Nothing to say");
  const key = ttsCacheUrl(voice, clean);
  let job = inflight.get(key);
  if (!job) {
    job = loadClip(key, clean, voice).finally(() => {
      inflight.delete(key);
    });
    inflight.set(key, job);
  }
  return signal ? withAbort(job, signal) : job;
}

const prefetchQueue: Array<{ key: string; text: string; voice: string }> = [];
let prefetchRunning = 0;

function pumpPrefetch(): void {
  while (prefetchRunning < PREFETCH_CONCURRENCY && prefetchQueue.length > 0) {
    if (!neuralAvailable()) {
      prefetchQueue.length = 0;
      return;
    }
    const item = prefetchQueue.shift();
    if (!item) return;
    prefetchRunning += 1;
    fetchSpeech(item.text, item.voice)
      .then(
        () => undefined,
        (error: unknown) => {
          const kind = error instanceof AiError ? error.kind : null;
          // The limit or the connection is gone: stop warming, real plays still try.
          if (kind === "rate-limit" || kind === "offline" || kind === "disabled") prefetchQueue.length = 0;
        },
      )
      .finally(() => {
        prefetchRunning -= 1;
        pumpPrefetch();
      });
  }
}

/** Warms the cache in the background (two at a time); the newest call goes first. */
export function prefetchSpeech(texts: readonly string[], voice: string): void {
  if (!voice || !neuralAvailable()) return;
  neuralRequested = true;
  const fresh: Array<{ key: string; text: string; voice: string }> = [];
  for (const text of texts) {
    for (const chunk of speechChunks(text)) {
      const key = ttsCacheUrl(voice, chunk);
      if (inflight.has(key) || fresh.some((item) => item.key === key)) continue;
      fresh.push({ key, text: chunk, voice });
    }
  }
  const older = prefetchQueue.filter((item) => !fresh.some((f) => f.key === item.key));
  prefetchQueue.length = 0;
  prefetchQueue.push(...fresh, ...older);
  if (prefetchQueue.length > PREFETCH_MAX_QUEUE) prefetchQueue.length = PREFETCH_MAX_QUEUE;
  pumpPrefetch();
}

/* ------------------------------------------------------------------- playing */

export type NeuralFailure = AiErrorKind | "playback";

export interface NeuralSpeakOptions {
  rate?: number;
  onStart?: () => void;
  onEnd?: () => void;
  /** Before onEnd, when the clip could not be fetched or played. */
  onError?: (reason: NeuralFailure) => void;
}

let sharedAudio: HTMLAudioElement | null = null;
/** Bumped whenever the shared element gets a new source, so a stale unlock does not pause it. */
let audioGeneration = 0;
let activeNeural: { finish: (failed: boolean) => void } | null = null;
let unlocked = false;
let silentClip: string | null = null;

function safely(fn: (() => void) | undefined): void {
  if (!fn) return;
  try {
    fn();
  } catch (err) {
    console.error("[tts] callback failed", err);
  }
}

function getAudio(): HTMLAudioElement | null {
  if (sharedAudio) return sharedAudio;
  if (typeof Audio === "undefined") return null;
  try {
    sharedAudio = new Audio();
    sharedAudio.preload = "auto";
    return sharedAudio;
  } catch {
    return null;
  }
}

/** 40 ms of 8-bit silence as a WAV data URI. */
function silentWav(): string {
  if (silentClip) return silentClip;
  const samples = 320;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, s: string): void => {
    for (let i = 0; i < s.length; i++) bytes[offset + i] = s.charCodeAt(i);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  ascii(36, "data");
  view.setUint32(40, samples, true);
  bytes.fill(128, 44);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] ?? 0);
  silentClip = `data:audio/wav;base64,${btoa(binary)}`;
  return silentClip;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

/** Plays silence on the shared element; inside a user gesture this lets iOS play it later. */
function primeAudio(audio: HTMLAudioElement): void {
  if (unlocked) return;
  const generation = ++audioGeneration;
  try {
    audio.src = silentWav();
    const played = audio.play();
    if (!played) {
      unlocked = true;
      return;
    }
    played.then(
      () => {
        unlocked = true;
        removeUnlockListeners();
        if (audioGeneration === generation) {
          try {
            audio.pause();
          } catch {
            // ignore
          }
        }
      },
      (error: unknown) => {
        // AbortError: a real clip replaced the silence, so play() was allowed.
        if (isAbortError(error)) {
          unlocked = true;
          removeUnlockListeners();
        }
      },
    );
  } catch {
    // Try again on the next gesture.
  }
}

/** Call from a pointer or key handler: lets iOS Safari play neural clips after async fetches. */
export function unlockAudio(): void {
  if (unlocked || activeNeural) return;
  const audio = getAudio();
  if (audio) primeAudio(audio);
}

const UNLOCK_EVENTS = ["pointerdown", "pointerup", "touchend", "keydown"] as const;
let unlockInstalled = false;

function onGesture(): void {
  if (unlocked) {
    removeUnlockListeners();
    return;
  }
  // Only once a natural voice is wanted: playing even silence pauses other apps' music on iOS.
  if (neuralRequested && neuralAvailable()) unlockAudio();
}

function removeUnlockListeners(): void {
  if (!unlockInstalled || typeof window === "undefined") return;
  unlockInstalled = false;
  for (const type of UNLOCK_EVENTS) {
    try {
      window.removeEventListener(type, onGesture, true);
    } catch {
      // ignore
    }
  }
}

/** Idempotent; lib/speech.ts calls it on load in the browser. */
export function installAudioUnlock(): void {
  if (unlockInstalled || unlocked || typeof window === "undefined" || !aiEnabled()) return;
  if (typeof window.addEventListener !== "function") return;
  unlockInstalled = true;
  for (const type of UNLOCK_EVENTS) window.addEventListener(type, onGesture, { capture: true, passive: true });
}

function applyRate(audio: HTMLAudioElement, rate: number): void {
  const media = audio as HTMLAudioElement & { webkitPreservesPitch?: boolean };
  try {
    media.preservesPitch = true;
    media.webkitPreservesPitch = true;
    // Setting src resets playbackRate to defaultPlaybackRate, so set both after it.
    media.defaultPlaybackRate = rate;
    media.playbackRate = rate;
  } catch {
    // Keep normal speed.
  }
}

/**
 * Fetches and plays one clip (≤ 300 chars). Replaces whatever neural clip is playing. Returns a
 * cancel function; cancelling fires onEnd (not onError). onEnd fires exactly once in every path.
 */
export function speakNeural(text: string, voice: string, opts: NeuralSpeakOptions = {}): () => void {
  let done = false;
  let started = false;
  let url: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const controller = new AbortController();
  const listeners: Array<[string, () => void]> = [];
  const rate = clampRate(opts.rate);
  const handle = { finish };
  neuralRequested = true;

  function finish(failed: boolean, reason: NeuralFailure = "playback"): void {
    if (done) return;
    done = true;
    controller.abort();
    if (timer !== null) clearTimeout(timer);
    if (audio) {
      for (const [type, fn] of listeners) audio.removeEventListener(type, fn);
      if (url !== null) {
        try {
          audio.pause();
          audio.removeAttribute("src");
          // Drops the decoded clip; with no src this fires no "error".
          audio.load();
        } catch {
          // ignore
        }
      }
    }
    if (url !== null) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
      url = null;
    }
    if (activeNeural === handle) activeNeural = null;
    if (failed) safely(() => opts.onError?.(reason));
    safely(opts.onEnd);
  }

  const previous = activeNeural;
  activeNeural = null;
  previous?.finish(false);
  const audio = getAudio();
  if (!audio) {
    activeNeural = handle;
    setTimeout(() => finish(true), 0);
    return () => finish(false);
  }
  // Still inside the tap that asked for speech: the only moment iOS allows unlocking.
  primeAudio(audio);
  activeNeural = handle;

  const play = (blob: Blob): void => {
    if (done) return;
    try {
      url = URL.createObjectURL(blob);
    } catch {
      finish(true);
      return;
    }
    const on = (type: string, fn: () => void): void => {
      audio.addEventListener(type, fn);
      listeners.push([type, fn]);
    };
    // The guards skip events left over from the previous source of the shared element.
    on("playing", () => {
      if (done || started) return;
      started = true;
      if (timer !== null) clearTimeout(timer);
      // Ceiling for a clip that never reports its end (about 3x normal speech time).
      timer = setTimeout(() => finish(false), 15_000 + (text.length * 150) / rate);
      safely(opts.onStart);
    });
    on("ended", () => {
      if (audio.ended) finish(false);
    });
    on("pause", () => {
      // The OS paused it (call, lock screen) or it reached the end.
      if (started && audio.paused) finish(false);
    });
    on("error", () => {
      if (audio.error) finish(true);
    });
    audioGeneration += 1;
    try {
      audio.src = url;
      applyRate(audio, rate);
      timer = setTimeout(() => {
        if (!started) finish(true);
      }, PLAY_START_TIMEOUT_MS);
      const played = audio.play();
      if (played) {
        played.catch(() => {
          if (!started) finish(true);
        });
      }
    } catch {
      finish(true);
    }
  };

  fetchSpeech(text, voice, controller.signal).then(play, (error: unknown) => {
    finish(true, error instanceof AiError ? error.kind : "unavailable");
  });

  return () => finish(false);
}

/** Stops the neural clip that is playing (its onEnd fires). */
export function stopNeural(): void {
  activeNeural?.finish(false);
}
