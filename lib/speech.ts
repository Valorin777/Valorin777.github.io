/**
 * Voice layer: text-to-speech (speechSynthesis) and speech recognition (Web Speech API).
 * Every function is SSR-safe, never throws and degrades to a no-op where the browser lacks
 * support. Callbacks follow one contract: onEnd fires exactly once per call, whatever happens
 * (finished, failed, cancelled, unsupported); onError, when it fires, comes before onEnd.
 */

/* ------------------------------------------------------------------ support */

export interface SpeechSupport {
  tts: boolean;
  recognition: boolean;
}

export function getSupport(): SpeechSupport {
  return { tts: getSynth() !== null, recognition: getRecognitionCtor() !== null };
}

/* ------------------------------------------------------------- voice ranking */

export interface VoiceLike {
  name: string;
  lang: string;
  voiceURI: string;
  localService: boolean;
  default: boolean;
}

/** macOS/iOS novelty, legacy MacinTalk and Eloquence voices: robotic or silly for a lesson. */
const NOVELTY_VOICES = new Set([
  "albert",
  "bad news",
  "bahh",
  "bells",
  "boing",
  "bubbles",
  "cellos",
  "good news",
  "jester",
  "organ",
  "pipe organ",
  "superstar",
  "trinoids",
  "whisper",
  "wobble",
  "zarvox",
  "deranged",
  "hysterical",
  "princess",
  "fred",
  "junior",
  "ralph",
  "kathy",
  "agnes",
  "bruce",
  "vicki",
  "victoria",
  "eddy",
  "flo",
  "grandma",
  "grandpa",
  "reed",
  "rocko",
  "sandy",
  "shelley",
]);

/** Apple voices that sound natural even in their default (compact) download. */
const APPLE_QUALITY_VOICES = new Set([
  "samantha",
  "daniel",
  "karen",
  "moira",
  "serena",
  "ava",
  "allison",
  "susan",
  "tom",
  "evan",
  "zoe",
  "nathan",
  "alex",
  "tessa",
  "fiona",
  "kate",
  "oliver",
  "jamie",
  "matilda",
  "lee",
  "rishi",
  "veena",
  "isha",
  "aaron",
  "nicky",
  "martha",
  "arthur",
  "gordon",
  "catherine",
  "noelle",
  "joelle",
  "stephanie",
]);

function normLang(lang: string): string {
  return (lang || "").replace(/_/g, "-").toLowerCase();
}

function isEnglish(voice: VoiceLike): boolean {
  const lang = normLang(voice.lang);
  return lang === "en" || lang.startsWith("en-");
}

/** "Eddy (English (US))" → "eddy". */
function baseName(name: string): string {
  return (name || "").replace(/\s*\(.*$/, "").trim().toLowerCase();
}

function qualityTier(voice: VoiceLike): number {
  const base = baseName(voice.name);
  const hay = `${voice.name} ${voice.voiceURI}`.toLowerCase();
  if (NOVELTY_VOICES.has(base) || hay.includes("eloquence")) return -10;
  if (/\b(natural|neural|premium|online)\b/.test(hay)) return 5;
  if (/\benhanced\b/.test(hay)) return 4;
  if (/^google\b/.test((voice.name || "").toLowerCase())) return 3;
  if (APPLE_QUALITY_VOICES.has(base) || hay.includes("siri")) return 2;
  return 1;
}

function voiceScore(voice: VoiceLike): number {
  const lang = normLang(voice.lang);
  const hay = `${voice.name} ${voice.voiceURI}`.toLowerCase();
  // British first by a hair: the app's default accent; quality still dominates.
  const region = lang.startsWith("en-gb") ? 22 : lang.startsWith("en-us") ? 20 : 0;
  const compact = hay.includes("compact") ? -10 : 0;
  return qualityTier(voice) * 100 + region + compact + (voice.default ? 1 : 0);
}

/** English voices only, best first. Stable: equal scores keep the browser's order. */
export function rankVoices<T extends VoiceLike>(voices: readonly T[]): T[] {
  return voices
    .filter(isEnglish)
    .map((voice, index) => ({ voice, index, score: voiceScore(voice) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.voice);
}

/** The voice with this URI (or name), else the best ranked English voice, else null. */
export function pickVoice<T extends VoiceLike>(voices: readonly T[], voiceURI: string | null): T | null {
  if (voiceURI) {
    const exact = voices.find((v) => v.voiceURI === voiceURI) ?? voices.find((v) => v.name === voiceURI);
    if (exact) return exact;
  }
  return rankVoices(voices)[0] ?? null;
}

/* --------------------------------------------------------------- text prep */

/** Content markup → what should be read aloud: **bold** unwrapped, "___" gaps read as "blank". */
export function plainText(s: string): string {
  return (s || "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/_{2,}/g, "blank")
    .replace(/\s+/g, " ")
    .trim();
}

export function clampRate(rate: number | undefined): number {
  if (typeof rate !== "number" || !Number.isFinite(rate)) return 1;
  return Math.min(1.2, Math.max(0.6, rate));
}

/* ------------------------------------------------------------------ helpers */

function safely(fn: (() => void) | undefined): void {
  if (!fn) return;
  try {
    fn();
  } catch (err) {
    console.error("[speech] callback failed", err);
  }
}

function defer(fn: () => void): void {
  setTimeout(fn, 0);
}

function getSynth(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  try {
    if (!("speechSynthesis" in window) || typeof window.SpeechSynthesisUtterance !== "function") return null;
    return window.speechSynthesis ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------- voices */

let cachedVoices: SpeechSynthesisVoice[] | null = null;
let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;
let watchingVoices = false;
const voiceListeners = new Set<(voices: SpeechSynthesisVoice[]) => void>();

function readVoices(synth: SpeechSynthesis): SpeechSynthesisVoice[] {
  try {
    return rankVoices(synth.getVoices() ?? []);
  } catch {
    return [];
  }
}

/** Edge and Chrome add network voices after the first list, so keep the cache fresh. */
function watchVoiceChanges(synth: SpeechSynthesis): void {
  if (watchingVoices) return;
  watchingVoices = true;
  try {
    synth.addEventListener("voiceschanged", () => {
      const next = readVoices(synth);
      if (!next.length) return;
      cachedVoices = next;
      for (const listener of voiceListeners) safely(() => listener(next));
    });
  } catch {
    // Old WebKit without EventTarget on speechSynthesis: the timeout path still works.
  }
}

/** Ranked English voices. Waits for "voiceschanged" (1500 ms max); cached after a non-empty list. */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (cachedVoices && cachedVoices.length) return Promise.resolve(cachedVoices);
  if (voicesPromise) return voicesPromise;
  const synth = getSynth();
  if (!synth) return Promise.resolve([]);
  watchVoiceChanges(synth);
  const now = readVoices(synth);
  if (now.length) {
    cachedVoices = now;
    return Promise.resolve(now);
  }
  voicesPromise = new Promise<SpeechSynthesisVoice[]>((resolve) => {
    let settled = false;
    const settle = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        synth.removeEventListener("voiceschanged", settle);
      } catch {
        // ignore
      }
      voicesPromise = null;
      const voices = readVoices(synth);
      if (voices.length) cachedVoices = voices;
      resolve(voices);
    };
    const timer = setTimeout(settle, 1500);
    try {
      synth.addEventListener("voiceschanged", settle);
    } catch {
      // timeout resolves
    }
  });
  return voicesPromise;
}

/** Called with the new ranked list whenever the browser's voices change. Returns unsubscribe. */
export function subscribeVoices(listener: (voices: SpeechSynthesisVoice[]) => void): () => void {
  const synth = getSynth();
  if (!synth) return () => {};
  watchVoiceChanges(synth);
  voiceListeners.add(listener);
  return () => {
    voiceListeners.delete(listener);
  };
}

function currentVoices(synth: SpeechSynthesis): SpeechSynthesisVoice[] {
  if (cachedVoices && cachedVoices.length) return cachedVoices;
  const voices = readVoices(synth);
  if (voices.length) cachedVoices = voices;
  return voices;
}

function resolveLang(voice: SpeechSynthesisVoice | null, synth: SpeechSynthesis): string {
  if (voice && isEnglish(voice)) return voice.lang.replace(/_/g, "-");
  let all: SpeechSynthesisVoice[] = [];
  try {
    all = synth.getVoices() ?? [];
  } catch {
    all = [];
  }
  if (all.some((v) => normLang(v.lang).startsWith("en-gb"))) return "en-GB";
  if (all.some((v) => normLang(v.lang).startsWith("en-us"))) return "en-US";
  return "en-GB";
}

/* -------------------------------------------------------------------- speak */

export interface SpeakOptions {
  voiceURI?: string | null;
  rate?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
}

interface ActiveSpeech {
  finish: (failed: boolean) => void;
  /** Chrome garbage-collects an utterance nobody references and then never fires its "end". */
  utterance: SpeechSynthesisUtterance | null;
}

let activeSpeech: ActiveSpeech | null = null;
// Safari drops speak() issued right after cancel() of a running utterance.
let cancelCooldown = false;

const TICK_MS = 250;
/** Chrome desktop cuts network voices off after ~15 s unless nudged. */
const KEEP_ALIVE_TICKS = 40;

function isDesktopChromium(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Chrome\/|Chromium\/|Edg\//.test(ua) && !/Android|Mobile/i.test(ua);
}

function cancelSynth(synth: SpeechSynthesis): void {
  let busy = false;
  try {
    busy = synth.speaking || synth.pending;
  } catch {
    busy = false;
  }
  try {
    synth.cancel();
  } catch {
    // ignore
  }
  if (busy) {
    cancelCooldown = true;
    setTimeout(() => {
      cancelCooldown = false;
    }, 120);
  }
}

/**
 * Speaks `text` (markup stripped). Cancels whatever is speaking first. Returns a cancel function;
 * cancelling fires onEnd (not onError).
 */
export function speak(text: string, opts: SpeakOptions = {}): () => void {
  let done = false;
  let started = false;
  let watch: ReturnType<typeof setInterval> | null = null;
  let delayed: ReturnType<typeof setTimeout> | null = null;
  const synth = getSynth();

  const handle: ActiveSpeech = { finish, utterance: null };
  function finish(failed: boolean): void {
    if (done) return;
    done = true;
    if (watch !== null) clearInterval(watch);
    if (delayed !== null) clearTimeout(delayed);
    handle.utterance = null;
    if (activeSpeech === handle) activeSpeech = null;
    if (failed) safely(opts.onError);
    safely(opts.onEnd);
  }
  const cancel = (): void => {
    if (done) return;
    if (activeSpeech === handle && synth) cancelSynth(synth);
    finish(false);
  };

  const previous = activeSpeech;
  activeSpeech = handle;
  previous?.finish(false);

  const clean = plainText(text);
  if (!synth || !clean) {
    defer(() => finish(!synth));
    return cancel;
  }

  let wasBusy = previous !== null || cancelCooldown;
  try {
    wasBusy = wasBusy || synth.speaking || synth.pending;
  } catch {
    // ignore
  }
  cancelSynth(synth);

  const voice = pickVoice(currentVoices(synth), opts.voiceURI ?? null);
  const rate = clampRate(opts.rate);
  let utterance: SpeechSynthesisUtterance;
  try {
    utterance = new SpeechSynthesisUtterance(clean);
  } catch {
    defer(() => finish(true));
    return cancel;
  }
  try {
    if (voice) utterance.voice = voice;
    utterance.lang = resolveLang(voice, synth);
    utterance.rate = rate;
    utterance.pitch = 1;
    utterance.volume = 1;
  } catch {
    // keep browser defaults
  }
  utterance.onstart = () => {
    if (done || started) return;
    started = true;
    safely(opts.onStart);
  };
  utterance.onend = () => finish(false);
  utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
    const code = event?.error;
    finish(!(code === "interrupted" || code === "canceled"));
  };

  const keepAlive = isDesktopChromium() && voice?.localService !== true;
  // Generous ceiling (~3x normal speech time) for browsers that get stuck in "speaking".
  const capTicks = Math.ceil((6000 + (clean.length * 130) / rate) / TICK_MS);

  const startWatch = (): void => {
    let ticks = 0;
    let idleTicks = 0;
    watch = setInterval(() => {
      if (done) return;
      ticks += 1;
      let speaking = false;
      let pending = false;
      try {
        speaking = synth.speaking;
        pending = synth.pending;
      } catch {
        // treat as idle
      }
      if (keepAlive && started && speaking && ticks % KEEP_ALIVE_TICKS === 0) {
        try {
          if (!synth.paused) {
            synth.pause();
            synth.resume();
          }
        } catch {
          // ignore
        }
      }
      idleTicks = speaking || pending ? 0 : idleTicks + 1;
      // Ended without an "end" event, or never started (iOS blocks speech outside a gesture).
      const silentEnd = idleTicks >= 4 && (started || ticks >= 12);
      if (silentEnd) {
        finish(false);
      } else if (ticks >= capTicks) {
        cancelSynth(synth);
        finish(false);
      }
    }, TICK_MS);
  };

  const run = (): void => {
    delayed = null;
    if (done) return;
    handle.utterance = utterance;
    try {
      if (synth.paused) synth.resume();
    } catch {
      // ignore
    }
    try {
      synth.speak(utterance);
    } catch {
      finish(true);
      return;
    }
    startWatch();
  };

  // Speaking synchronously keeps iOS's user-gesture unlock; the gap is only needed after a cancel.
  if (wasBusy) delayed = setTimeout(run, 80);
  else run();
  return cancel;
}

export function stopSpeaking(): void {
  const synth = getSynth();
  if (synth) cancelSynth(synth);
  activeSpeech?.finish(false);
}

/* -------------------------------------------------------------- recognition */

export type RecognitionError = "not-allowed" | "no-speech" | "network" | "aborted" | "unsupported" | "other";

/** Minimal Web Speech recognition types: lib.dom ships the result types but not the recognizer. */
interface RecognitionAlternativeLike {
  readonly transcript: string;
}

interface RecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: RecognitionAlternativeLike | undefined;
}

export interface RecognitionResultListLike {
  readonly length: number;
  readonly [index: number]: RecognitionResultLike | undefined;
}

interface RecognitionEventLike {
  readonly results: RecognitionResultListLike;
}

interface RecognitionErrorEventLike {
  readonly error: string;
}

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionCtor = new () => RecognitionLike;

interface RecognitionWindow {
  SpeechRecognition?: RecognitionCtor;
  webkitSpeechRecognition?: RecognitionCtor;
}

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  try {
    const w = window as unknown as RecognitionWindow;
    const ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    return typeof ctor === "function" ? ctor : null;
  } catch {
    return null;
  }
}

export function mapRecognitionError(code: string): RecognitionError {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "not-allowed";
    case "no-speech":
      return "no-speech";
    case "network":
      return "network";
    case "aborted":
      return "aborted";
    default:
      return "other";
  }
}

function squash(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Reads a recognition result list: the best transcript so far, the alternatives for the whole
 * utterance (earlier segments + each alternative of the last one) and whether all are final.
 */
export function collectTranscripts(results: RecognitionResultListLike): {
  transcript: string;
  alternatives: string[];
  isFinal: boolean;
} {
  const n = results?.length ?? 0;
  if (!n) return { transcript: "", alternatives: [], isFinal: false };
  const best: string[] = [];
  let isFinal = true;
  for (let i = 0; i < n; i++) {
    const result = results[i];
    best.push(result?.[0]?.transcript ?? "");
    if (!result?.isFinal) isFinal = false;
  }
  const transcript = squash(best.join(" "));
  const prefix = best.slice(0, -1).join(" ");
  const last = results[n - 1];
  const alternatives: string[] = [];
  for (let j = 0; j < (last?.length ?? 0); j++) {
    const alt = squash(`${prefix} ${last?.[j]?.transcript ?? ""}`);
    if (alt && !alternatives.includes(alt)) alternatives.push(alt);
  }
  if (!alternatives.length && transcript) alternatives.push(transcript);
  return { transcript, alternatives, isFinal };
}

export interface ListenOptions {
  lang?: string;
  onInterim?: (text: string) => void;
  onResult: (alternatives: string[]) => void;
  onError?: (e: RecognitionError) => void;
  onEnd?: () => void;
  timeoutMs?: number;
}

/** "stop" (default) finishes gracefully and still delivers what was heard; "abort" drops it. */
export type StopListening = (mode?: "stop" | "abort") => void;

let activeListen: { abort: () => void } | null = null;
// Chrome may fail a recognizer started right after another one was aborted.
let listenCooldown = false;

/** Stops after this much silence once something was heard (Safari may never finalize). */
const SILENCE_MS = 2500;
/** How long to wait for "end" after stop() before giving up on the browser. */
const END_GRACE_MS = 1500;

/**
 * One-shot recognition. Delivers onResult(alternatives) at most once, or onError; onEnd always
 * fires exactly once. Hearing nothing is reported as "no-speech".
 */
export function listen(opts: ListenOptions): StopListening {
  let ended = false;
  let delivered = false;
  let errored = false;
  let aborted = false;
  let started = false;
  let stopping = false;
  let rec: RecognitionLike | null = null;
  let lastAlternatives: string[] = [];
  let startTimer: ReturnType<typeof setTimeout> | null = null;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let graceTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = (): void => {
    for (const t of [startTimer, timeoutTimer, silenceTimer, graceTimer]) if (t !== null) clearTimeout(t);
    startTimer = timeoutTimer = silenceTimer = graceTimer = null;
  };

  const handle = { abort: () => stop("abort") };

  function finish(): void {
    if (ended) return;
    ended = true;
    clearTimers();
    if (activeListen === handle) activeListen = null;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
    }
    listenCooldown = true;
    setTimeout(() => {
      listenCooldown = false;
    }, 250);
    safely(opts.onEnd);
  }

  function fail(code: RecognitionError): void {
    if (ended || delivered || errored) return;
    errored = true;
    safely(() => opts.onError?.(code));
  }

  function deliver(alternatives: string[]): void {
    if (ended || delivered || errored || !alternatives.length) return;
    delivered = true;
    safely(() => opts.onResult(alternatives));
  }

  function wrapUp(): void {
    if (ended) return;
    if (!aborted && !delivered && !errored) {
      if (lastAlternatives.length) deliver(lastAlternatives);
      else fail("no-speech");
    }
    finish();
  }

  function armGrace(ms: number): void {
    if (graceTimer !== null) clearTimeout(graceTimer);
    graceTimer = setTimeout(() => {
      try {
        rec?.abort();
      } catch {
        // ignore
      }
      wrapUp();
    }, ms);
  }

  function stop(mode: "stop" | "abort" = "stop"): void {
    if (ended) return;
    if (mode === "abort" || !rec || !started) {
      aborted = true;
      try {
        if (started) rec?.abort();
      } catch {
        // ignore
      }
      finish();
      return;
    }
    if (stopping) return;
    stopping = true;
    try {
      rec.stop();
    } catch {
      wrapUp();
      return;
    }
    armGrace(END_GRACE_MS);
  }

  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    defer(() => {
      fail("unsupported");
      finish();
    });
    return stop;
  }

  const previous = activeListen;
  activeListen = handle;
  previous?.abort();
  // Do not let the app hear itself.
  stopSpeaking();
  // Both cooldowns are set by the abort/cancel just above when something was running.
  const needsGap = listenCooldown || cancelCooldown;

  try {
    rec = new Ctor();
    rec.lang = opts.lang || "en-US";
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    rec.continuous = false;
  } catch {
    rec = null;
    defer(() => {
      fail("other");
      finish();
    });
    return stop;
  }

  rec.onresult = (event) => {
    if (ended) return;
    const { transcript, alternatives, isFinal } = collectTranscripts(event.results);
    if (transcript) {
      lastAlternatives = alternatives;
      safely(() => opts.onInterim?.(transcript));
    }
    if (isFinal && alternatives.length) {
      deliver(alternatives);
      stop("stop");
      return;
    }
    if (transcript && !stopping) {
      if (silenceTimer !== null) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => stop("stop"), SILENCE_MS);
    }
  };
  rec.onerror = (event) => {
    if (ended) return;
    const code = mapRecognitionError(event?.error ?? "");
    if (code === "aborted" && aborted) return;
    if (code === "no-speech" && lastAlternatives.length) deliver(lastAlternatives);
    else fail(code);
    armGrace(800);
  };
  rec.onend = () => wrapUp();

  const timeoutMs =
    typeof opts.timeoutMs === "number" && Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0
      ? opts.timeoutMs
      : 8000;

  const begin = (): void => {
    startTimer = null;
    if (ended || !rec) return;
    try {
      rec.start();
      started = true;
    } catch {
      fail("other");
      finish();
      return;
    }
    timeoutTimer = setTimeout(() => stop("stop"), timeoutMs);
  };

  if (needsGap) startTimer = setTimeout(begin, 150);
  else begin();
  return stop;
}
