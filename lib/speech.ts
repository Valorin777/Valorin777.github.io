/**
 * Voice layer: text-to-speech (a natural server voice via lib/tts.ts, else speechSynthesis) and
 * speech recognition (Web Speech API, else recording + the worker's /stt via lib/stt.ts).
 * Every function is SSR-safe, never throws and degrades to a no-op where the browser lacks
 * support. Callbacks follow one contract: onEnd fires exactly once per call, whatever happens
 * (finished, failed, cancelled, unsupported); onError, when it fires, comes before onEnd.
 */

import { aiEnabled } from "@/lib/ai";
import { transcribe } from "@/lib/stt";
import {
  clampRate,
  installAudioUnlock,
  neuralAvailable,
  recordedUrl,
  prefetchSpeech,
  speakNeural,
  sentenceChunks,
  fetchSpeech,
  stopNeural,
  type NeuralFailure,
} from "@/lib/tts";

export { clampRate, neuralAvailable, unlockAudio } from "@/lib/tts";

// iOS only lets <audio> play after an async fetch once it has played inside a user gesture.
installAudioUnlock();

/* ------------------------------------------------------------------ support */

export interface SpeechSupport {
  tts: boolean;
  recognition: boolean;
}

export function getSupport(): SpeechSupport {
  return {
    tts: getSynth() !== null || neuralAvailable(),
    recognition: getRecognitionCtor() !== null || serverRecognitionAvailable(),
  };
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
  /** Worker voice id (e.g. "a1-asteria"). Used when online; the device voice is the fallback. */
  neuralVoice?: string | null;
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
 * cancelling fires onEnd (not onError). With `neuralVoice` set and the worker reachable, the
 * natural voice plays; if it fails before starting, the device voice takes over silently.
 */
export function speak(text: string, opts: SpeakOptions = {}): () => void {
  const voice = opts.neuralVoice;
  const isRecorded = Boolean(voice && recordedUrl(plainText(text), voice));
  if (voice && (isRecorded || (neuralAvailable() && Date.now() >= neuralPausedUntil))) {
    const chunks = isRecorded ? [plainText(text)] : sentenceChunks(plainText(text));
    // Voice every sentence at once; each one plays as soon as the one before it ends.
    if (!isRecorded) for (const c of chunks.slice(1)) void fetchSpeech(c, voice).catch(() => undefined);
    if (chunks.length) return speakNatural(chunks, voice, opts);
  }
  return speakDevice(text, opts);
}

/**
 * A natural voice is worth waiting for: the device voice only takes over when the natural one
 * really fails, or after this long without a sound.
 */
const NEURAL_START_TIMEOUT_MS = 20_000;
/** After a slow or refused natural voice, use the device voice for a while. */
const NEURAL_PAUSE_MS = 60_000;
let neuralPausedUntil = 0;

function pauseNeural(reason: NeuralFailure | "slow"): void {
  const transient: ReadonlyArray<NeuralFailure | "slow"> = ["rate-limit", "unavailable"];
  if (transient.includes(reason)) neuralPausedUntil = Date.now() + NEURAL_PAUSE_MS;
}

/** Plays the pieces one after another through the natural voice. */
function speakNatural(chunks: string[], voice: string, opts: SpeakOptions): () => void {
  let done = false;
  let started = false;
  let index = 0;
  let current: (() => void) | null = null;
  let fallback: (() => void) | null = null;
  let startTimer: ReturnType<typeof setTimeout> | null = null;

  const handle: ActiveSpeech = { finish, utterance: null };
  function quiet(): void {
    done = true;
    if (startTimer !== null) clearTimeout(startTimer);
    startTimer = null;
    if (activeSpeech === handle) activeSpeech = null;
    const stopClip = current;
    current = null;
    stopClip?.();
  }
  function finish(failed: boolean): void {
    if (done) return;
    quiet();
    if (failed) safely(opts.onError);
    safely(opts.onEnd);
  }
  /** The device voice reads what is left, with the same callbacks; this handle goes quiet. */
  function handOff(): void {
    if (done) return;
    const rest = chunks.slice(index).join(" ");
    quiet();
    fallback = speakDevice(rest, {
      voiceURI: opts.voiceURI,
      rate: opts.rate,
      onStart: started ? undefined : opts.onStart,
      onEnd: opts.onEnd,
      onError: opts.onError,
    });
  }

  const previous = activeSpeech;
  activeSpeech = handle;
  previous?.finish(false);
  const synth = getSynth();
  if (synth && previous) cancelSynth(synth);

  const playNext = (): void => {
    if (done) return;
    let clipStarted = false;
    let failure: NeuralFailure | null = null;
    current = speakNeural(chunks[index] ?? "", voice, {
      rate: opts.rate,
      onStart: () => {
        if (done) return;
        clipStarted = true;
        if (started) return;
        started = true;
        if (startTimer !== null) clearTimeout(startTimer);
        startTimer = null;
        safely(opts.onStart);
      },
      onError: (reason) => {
        failure = reason;
      },
      onEnd: () => {
        if (done) return;
        current = null;
        if (failure !== null) {
          if (!started) pauseNeural(failure);
          handOff();
        } else if (!clipStarted) {
          // Replaced by a direct speakNeural() call elsewhere.
          finish(false);
        } else {
          index += 1;
          if (index < chunks.length) playNext();
          else finish(false);
        }
      },
    });
  };

  startTimer = setTimeout(() => {
    startTimer = null;
    if (done || started) return;
    handOff();
  }, NEURAL_START_TIMEOUT_MS);
  playNext();

  return () => {
    if (fallback) fallback();
    else finish(false);
  };
}

/** Warms the natural-voice cache for sentences about to be played (same text prep as speak). */
export function prefetchNeuralSpeech(texts: readonly string[], neuralVoice: string | null | undefined): void {
  if (!neuralVoice || !neuralAvailable() || Date.now() < neuralPausedUntil) return;
  prefetchSpeech(texts.map(plainText), neuralVoice);
}

/** The device voice (speechSynthesis). */
function speakDevice(text: string, opts: SpeakOptions): () => void {
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
  stopNeural();
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

/** "waiting" for the first words, "hearing" them, "processing" the recording on the worker. */
export type ListenPhase = "waiting" | "hearing" | "processing";

export interface ListenOptions {
  lang?: string;
  onInterim?: (text: string) => void;
  onResult: (alternatives: string[]) => void;
  onError?: (e: RecognitionError) => void;
  onEnd?: () => void;
  onPhase?: (phase: ListenPhase) => void;
  /** Mic level 0–1 about ten times a second (recording path only). */
  onLevel?: (level: number) => void;
  /** How long to wait for the learner to start speaking. Once they speak, maxMs applies. */
  timeoutMs?: number;
  /** Hard cap for one answer, from the start (default 30 s, 90 s when long). */
  maxMs?: number;
  /**
   * A conversation answer: several sentences with thinking pauses. Records on the worker when
   * it can (one stream, our own pause detection); else keeps Web Speech running through pauses.
   */
  long?: boolean;
}

/** "stop" (default) finishes gracefully and still delivers what was heard; "abort" drops it. */
export type StopListening = (mode?: "stop" | "abort") => void;

let activeListen: { abort: () => void } | null = null;
// Chrome may fail a recognizer started right after another one was aborted.
let listenCooldown = false;
/** Web Speech could not reach its service this session: record and use the worker instead. */
let webSpeechBroken = false;

/** Stops after this much silence once something was heard (Safari may never finalize). */
const SILENCE_MS = 2500;
/** The same for a conversation answer: room to think between sentences. */
const LONG_SILENCE_MS = 3200;
/** How long to wait for "end" after stop() before giving up on the browser. */
const END_GRACE_MS = 1500;

const positive = (n: number | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

function listenTimeout(opts: ListenOptions): number {
  return positive(opts.timeoutMs) ? opts.timeoutMs : 8000;
}

function listenMax(opts: ListenOptions): number {
  const max = positive(opts.maxMs) ? opts.maxMs : opts.long ? 90_000 : 30_000;
  return Math.max(max, listenTimeout(opts));
}

/**
 * One-shot recognition. Delivers onResult(alternatives) at most once, or onError; onEnd always
 * fires exactly once. Hearing nothing is reported as "no-speech". Uses Web Speech where it works,
 * otherwise records the answer and sends it to the worker (one alternative only).
 */
export function listen(opts: ListenOptions): StopListening {
  const Ctor = getRecognitionCtor();
  const server = serverRecognitionAvailable();
  // A long answer is recorded in one piece: browsers end recognition at the first pause.
  if (server && (!Ctor || webSpeechBroken || opts.long)) return listenServer(opts);
  if (!Ctor) {
    let ended = false;
    const finishUnsupported = (report: boolean): void => {
      if (ended) return;
      ended = true;
      if (report) safely(() => opts.onError?.("unsupported"));
      safely(opts.onEnd);
    };
    defer(() => finishUnsupported(true));
    return () => finishUnsupported(false);
  }
  return listenWeb(opts, Ctor, server);
}

function listenWeb(opts: ListenOptions, Ctor: RecognitionCtor, serverFallback: boolean): StopListening {
  let ended = false;
  let delivered = false;
  let errored = false;
  let aborted = false;
  let started = false;
  let stopping = false;
  let rec: RecognitionLike | null = null;
  let delegate: StopListening | null = null;
  let lastAlternatives: string[] = [];
  let hearing = false;
  let startedAt = Date.now();
  const silenceMs = opts.long ? LONG_SILENCE_MS : SILENCE_MS;
  let startTimer: ReturnType<typeof setTimeout> | null = null;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let graceTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = (): void => {
    for (const t of [startTimer, timeoutTimer, silenceTimer, graceTimer]) if (t !== null) clearTimeout(t);
    startTimer = timeoutTimer = silenceTimer = graceTimer = null;
  };

  const handle = { abort: () => stop("abort") };

  function detach(): void {
    if (!rec) return;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
  }

  function finish(): void {
    if (ended) return;
    ended = true;
    clearTimers();
    if (activeListen === handle) activeListen = null;
    detach();
    listenCooldown = true;
    setTimeout(() => {
      listenCooldown = false;
    }, 250);
    safely(opts.onEnd);
  }

  /** The recorder takes over with the same callbacks; this recognizer goes quiet. */
  function handOff(): void {
    ended = true;
    clearTimers();
    detach();
    try {
      rec?.abort();
    } catch {
      // ignore
    }
    if (activeListen === handle) activeListen = null;
    delegate = listenServer(opts);
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
    if (delegate) {
      delegate(mode);
      return;
    }
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
    // A long answer keeps the recognizer running through pauses; our silence timer ends it.
    rec.continuous = Boolean(opts.long);
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
      if (!hearing) {
        hearing = true;
        safely(() => opts.onPhase?.("hearing"));
        // The learner is talking: no more "waiting" deadline, only the overall cap.
        if (timeoutTimer !== null) clearTimeout(timeoutTimer);
        timeoutTimer = setTimeout(() => stop("stop"), Math.max(0, listenMax(opts) - (Date.now() - startedAt)));
      }
    }
    if (isFinal && alternatives.length && !opts.long) {
      deliver(alternatives);
      stop("stop");
      return;
    }
    if (transcript && !stopping) {
      if (silenceTimer !== null) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => stop("stop"), silenceMs);
    }
  };
  rec.onerror = (event) => {
    if (ended) return;
    const raw = event?.error ?? "";
    // Chrome's recognizer lives on Google's servers, often unreachable from Russia without a VPN.
    if (serverFallback && (raw === "network" || raw === "service-not-allowed") && !lastAlternatives.length) {
      webSpeechBroken = true;
      if (!aborted && !delivered) {
        handOff();
        return;
      }
    }
    const code = mapRecognitionError(raw);
    if (code === "aborted" && aborted) return;
    if (code === "no-speech" && lastAlternatives.length) deliver(lastAlternatives);
    else fail(code);
    armGrace(800);
  };
  rec.onend = () => wrapUp();

  const timeoutMs = listenTimeout(opts);

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
    startedAt = Date.now();
    safely(() => opts.onPhase?.("waiting"));
    timeoutTimer = setTimeout(() => stop("stop"), timeoutMs);
  };

  if (needsGap) startTimer = setTimeout(begin, 150);
  else begin();
  return stop;
}

/* ------------------------------------------------- server recognition (worker) */

interface TrackLike {
  stop(): void;
}

interface StreamLike {
  getTracks(): TrackLike[];
}

interface MediaDevicesLike {
  getUserMedia(constraints: { audio: boolean | Record<string, boolean> }): Promise<StreamLike>;
}

interface RecorderLike {
  readonly mimeType: string;
  readonly state: string;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

interface RecorderCtor {
  new (stream: StreamLike, options?: { mimeType?: string; audioBitsPerSecond?: number }): RecorderLike;
  isTypeSupported?: (type: string) => boolean;
}

interface AnalyserLike {
  fftSize: number;
  getByteTimeDomainData(array: Uint8Array): void;
  getFloatTimeDomainData?(array: Float32Array): void;
}

interface AudioContextLike {
  createMediaStreamSource(stream: StreamLike): { connect(node: AnalyserLike): unknown };
  createAnalyser(): AnalyserLike;
  resume?: () => Promise<void>;
  close(): Promise<void>;
}

interface MediaWindow {
  MediaRecorder?: RecorderCtor;
  AudioContext?: new () => AudioContextLike;
  webkitAudioContext?: new () => AudioContextLike;
}

/** Chrome/Firefox record Opus in WebM; Safari only does MP4 (AAC). */
const RECORDER_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
const LEVEL_TICK_MS = 100;
/** Quiet that ends a one-sentence answer once the learner has spoken. */
const SERVER_SILENCE_MS = 1800;
/** Quiet that ends a conversation answer: room to think between sentences. */
const SERVER_LONG_SILENCE_MS = 2600;
/** After only a word or two ("well… um") the learner is still finding the sentence: wait longer. */
const SERVER_HESITATION_MS = 3800;
const HESITATION_VOICED_MS = 1200;
/**
 * Voice = RMS (0–1) well above the room's own noise. The noise floor is the quietest level of
 * the last few seconds (speech always has gaps), so a quiet mic or a noisy room both work; a
 * normal voice (above the cap) always counts, even from the very first moment.
 */
const NOISE_FACTOR = 3;
const MIN_SPEECH_LEVEL = 0.01;
const MAX_SPEECH_LEVEL = 0.06;
const FLOOR_WINDOW_TICKS = 50;
/** Ticks above the threshold before the answer counts as started (ignores a click). */
const SPEECH_TICKS = 3;

function mediaWindow(): MediaWindow | null {
  return typeof window === "undefined" ? null : (window as unknown as MediaWindow);
}

function getRecorderCtor(): RecorderCtor | null {
  try {
    const ctor = mediaWindow()?.MediaRecorder;
    return typeof ctor === "function" ? ctor : null;
  } catch {
    return null;
  }
}

function getMediaDevices(): MediaDevicesLike | null {
  if (typeof navigator === "undefined") return null;
  try {
    const devices = (navigator as unknown as { mediaDevices?: MediaDevicesLike }).mediaDevices;
    return devices && typeof devices.getUserMedia === "function" ? devices : null;
  } catch {
    return null;
  }
}

function getAudioContextCtor(): (new () => AudioContextLike) | null {
  const w = mediaWindow();
  const ctor = w?.AudioContext ?? w?.webkitAudioContext;
  return typeof ctor === "function" ? ctor : null;
}

function serverRecognitionAvailable(): boolean {
  return aiEnabled() && getRecorderCtor() !== null && getMediaDevices() !== null;
}

export function pickRecorderType(isTypeSupported: ((type: string) => boolean) | undefined): string {
  if (typeof isTypeSupported !== "function") return "";
  for (const type of RECORDER_TYPES) {
    try {
      if (isTypeSupported(type)) return type;
    } catch {
      // ignore
    }
  }
  return "";
}

/** Root mean square of 8-bit PCM (128 = silence), 0–1. */
export function levelOf(samples: Uint8Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = ((samples[i] ?? 128) - 128) / 128;
    sum += x * x;
  }
  return Math.sqrt(sum / samples.length);
}

function micError(error: unknown): RecognitionError {
  const name = typeof error === "object" && error !== null ? (error as { name?: unknown }).name : undefined;
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "not-allowed";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "unsupported";
  return "other";
}

function recognitionLang(lang: string | undefined): "en" | "ru" {
  return (lang || "en").toLowerCase().startsWith("ru") ? "ru" : "en";
}

/** Root mean square of float PCM (-1…1), 0–1. */
export function levelOfFloat(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i] ?? 0;
    sum += x * x;
  }
  return Math.min(1, Math.sqrt(sum / samples.length));
}

/**
 * Tracks the room's noise floor and decides what counts as voice. Pure, so it is unit-tested
 * with plain numbers.
 */
export function createVoiceDetector(): { push(level: number): { voiced: boolean; threshold: number } } {
  const recent: number[] = [];
  return {
    push(level: number) {
      // Exact zeros are a mic still warming up (or muted), not the room.
      if (level > 0) recent.push(level);
      if (recent.length > FLOOR_WINDOW_TICKS) recent.shift();
      const floor = recent.length ? Math.min(...recent) : 0;
      const threshold = Math.min(MAX_SPEECH_LEVEL, Math.max(MIN_SPEECH_LEVEL, floor * NOISE_FACTOR));
      return { voiced: level >= threshold, threshold };
    },
  };
}

/**
 * Records until the learner has spoken and gone quiet (about 2 s; longer for a conversation
 * answer or after a hesitant start), stop(), the waiting timeout (nobody spoke) or the overall
 * cap; then transcribes on the worker. Same contract as the Web Speech path; onInterim gets "…"
 * while uploading.
 */
function listenServer(opts: ListenOptions): StopListening {
  let ended = false;
  let delivered = false;
  let errored = false;
  let phase: "starting" | "recording" | "stopping" | "uploading" = "starting";
  let stream: StreamLike | null = null;
  let recorder: RecorderLike | null = null;
  let context: AudioContextLike | null = null;
  let levelTimer: ReturnType<typeof setInterval> | null = null;
  let waitTimer: ReturnType<typeof setTimeout> | null = null;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;
  /** The level meter ran and saw a signal, so "nothing voiced" can be trusted. */
  let meterWorked = false;
  let voicedTicks = 0;
  let spoke = false;
  let mimeType = "";
  const chunks: Blob[] = [];
  const upload = new AbortController();
  const handle = { abort: () => stop("abort") };

  function clearTimers(): void {
    if (levelTimer !== null) clearInterval(levelTimer);
    if (waitTimer !== null) clearTimeout(waitTimer);
    if (maxTimer !== null) clearTimeout(maxTimer);
    levelTimer = waitTimer = maxTimer = null;
  }

  function releaseInput(): void {
    clearTimers();
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {
        // ignore
      }
    }
    for (const track of stream?.getTracks() ?? []) {
      try {
        track.stop();
      } catch {
        // ignore
      }
    }
    stream = null;
    if (context) {
      context.close().catch(() => undefined);
      context = null;
    }
  }

  function finish(): void {
    if (ended) return;
    ended = true;
    releaseInput();
    upload.abort();
    if (activeListen === handle) activeListen = null;
    safely(opts.onEnd);
  }

  function fail(code: RecognitionError): void {
    if (ended || delivered || errored) return;
    errored = true;
    safely(() => opts.onError?.(code));
  }

  function deliver(text: string): void {
    if (ended || delivered || errored) return;
    delivered = true;
    safely(() => opts.onResult([text]));
  }

  function send(): void {
    if (ended || phase === "uploading") return;
    phase = "uploading";
    const type = mimeType || chunks.find((chunk) => chunk.type)?.type || "audio/webm";
    const blob = new Blob(chunks, { type });
    releaseInput();
    // A working meter that never heard a voice: nothing worth uploading (Whisper invents text on silence).
    if (!blob.size || (meterWorked && voicedTicks === 0)) {
      fail("no-speech");
      finish();
      return;
    }
    safely(() => opts.onPhase?.("processing"));
    safely(() => opts.onInterim?.("…"));
    transcribe(blob, recognitionLang(opts.lang), upload.signal).then(
      (text) => {
        if (ended) return;
        if (text) deliver(text);
        else fail("no-speech");
        finish();
      },
      () => {
        if (ended) return;
        fail("network");
        finish();
      },
    );
  }

  function stopRecording(): void {
    if (phase !== "recording") return;
    phase = "stopping";
    clearTimers();
    try {
      // "dataavailable" then "stop" follow; send() runs from onstop.
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
        return;
      }
    } catch {
      // fall through
    }
    send();
  }

  function stop(mode: "stop" | "abort" = "stop"): void {
    if (ended) return;
    if (mode === "abort" || phase === "starting") {
      finish();
      return;
    }
    stopRecording();
  }

  function watchLevel(input: StreamLike): void {
    const Ctx = getAudioContextCtor();
    if (!Ctx) return;
    try {
      const ctx = new Ctx();
      context = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(input).connect(analyser);
      ctx.resume?.().catch(() => undefined);
      const floats = typeof analyser.getFloatTimeDomainData === "function" ? new Float32Array(analyser.fftSize) : null;
      const bytes = new Uint8Array(analyser.fftSize);
      const detector = createVoiceDetector();
      let quietTicks = 0;
      levelTimer = setInterval(() => {
        if (phase !== "recording") return;
        let level: number;
        if (floats && analyser.getFloatTimeDomainData) {
          analyser.getFloatTimeDomainData(floats);
          level = levelOfFloat(floats);
        } else {
          analyser.getByteTimeDomainData(bytes);
          level = levelOf(bytes);
        }
        if (level > 0) meterWorked = true;
        const { voiced, threshold } = detector.push(level);
        safely(() => opts.onLevel?.(Math.min(1, level / (threshold * 4))));
        if (voiced) {
          voicedTicks += 1;
          quietTicks = 0;
          if (!spoke && voicedTicks >= SPEECH_TICKS) {
            spoke = true;
            // Talking now: the "nobody answered" deadline no longer applies.
            if (waitTimer !== null) clearTimeout(waitTimer);
            waitTimer = null;
            safely(() => opts.onPhase?.("hearing"));
          }
          return;
        }
        quietTicks += 1;
        if (!spoke) return;
        const voicedMs = voicedTicks * LEVEL_TICK_MS;
        const endAfter = !opts.long
          ? SERVER_SILENCE_MS
          : voicedMs < HESITATION_VOICED_MS
            ? SERVER_HESITATION_MS
            : SERVER_LONG_SILENCE_MS;
        if (quietTicks * LEVEL_TICK_MS >= endAfter) stopRecording();
      }, LEVEL_TICK_MS);
    } catch {
      // No meter: stop() or the timeouts end the recording.
    }
  }

  function record(Recorder: RecorderCtor, input: StreamLike): void {
    const type = pickRecorderType(Recorder.isTypeSupported?.bind(Recorder));
    try {
      recorder = type ? new Recorder(input, { mimeType: type, audioBitsPerSecond: 48_000 }) : new Recorder(input);
    } catch {
      try {
        recorder = new Recorder(input);
      } catch {
        fail("other");
        finish();
        return;
      }
    }
    const rec = recorder;
    rec.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    rec.onstop = () => send();
    rec.onerror = () => {
      if (ended) return;
      fail("other");
      finish();
    };
    try {
      rec.start();
    } catch {
      fail("other");
      finish();
      return;
    }
    // Safari fills mimeType only once recording has started.
    mimeType = rec.mimeType || type;
    phase = "recording";
    safely(() => opts.onPhase?.("waiting"));
    watchLevel(input);
    waitTimer = setTimeout(stopRecording, listenTimeout(opts));
    maxTimer = setTimeout(stopRecording, listenMax(opts));
  }

  const previous = activeListen;
  activeListen = handle;
  previous?.abort();
  stopSpeaking();

  const devices = getMediaDevices();
  const Recorder = getRecorderCtor();
  if (!devices || !Recorder) {
    defer(() => {
      fail("unsupported");
      finish();
    });
    return stop;
  }

  let request: Promise<StreamLike>;
  try {
    request = devices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (error) {
    defer(() => {
      fail(micError(error));
      finish();
    });
    return stop;
  }
  request.then(
    (input) => {
      if (ended) {
        for (const track of input.getTracks()) track.stop();
        return;
      }
      stream = input;
      record(Recorder, input);
    },
    (error: unknown) => {
      if (ended) return;
      fail(micError(error));
      finish();
    },
  );
  return stop;
}
