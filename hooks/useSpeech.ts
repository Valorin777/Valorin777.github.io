"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  getSupport,
  listen,
  loadVoices,
  prefetchNeuralSpeech,
  speak as speakText,
  subscribeVoices,
  type ListenPhase,
  type RecognitionError,
  type SpeechSupport,
  type StopListening,
} from "@/lib/speech";

/* ------------------------------------------------------------------ support */

let supportSnapshot: SpeechSupport | null = null;

function getSupportSnapshot(): SpeechSupport {
  if (!supportSnapshot) supportSnapshot = getSupport();
  return supportSnapshot;
}

function getServerSupport(): SpeechSupport | null {
  return null;
}

function subscribeNever(): () => void {
  return () => {};
}

/** null during SSR and hydration (so markup matches), then the real support. */
export function useSpeechSupport(): SpeechSupport | null {
  return useSyncExternalStore<SpeechSupport | null>(subscribeNever, getSupportSnapshot, getServerSupport);
}

/* ------------------------------------------------------------------- voices */

interface VoicesState {
  voices: SpeechSynthesisVoice[];
  ready: boolean;
}

const NO_VOICES: VoicesState = { voices: [], ready: false };

/** Ranked English voices; `ready` turns true once the browser answered (possibly with none). */
export function useVoices(): VoicesState {
  const [state, setState] = useState<VoicesState>(NO_VOICES);
  useEffect(() => {
    let alive = true;
    loadVoices().then(
      (voices) => {
        if (alive) setState({ voices, ready: true });
      },
      () => {
        if (alive) setState((s) => ({ ...s, ready: true }));
      },
    );
    const unsubscribe = subscribeVoices((voices) => {
      if (alive) setState({ voices, ready: true });
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  return state;
}

/* ------------------------------------------------------------------ speaker */

export interface Speaker {
  speak: (text: string, id?: string) => void;
  stop: () => void;
  /** The id passed to the utterance that is playing now (null if none, or if it had no id). */
  speakingId: string | null;
  /** Anything is playing, with or without an id. */
  speaking: boolean;
}

/** `neuralVoice` (a worker voice id) plays the natural voice when online, else the device voice. */
export function useSpeaker(opts: { voiceURI: string | null; rate: number; neuralVoice?: string | null }): Speaker {
  const { voiceURI, rate } = opts;
  const neuralVoice = opts.neuralVoice ?? null;
  const [current, setCurrent] = useState<{ id: string | null } | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const tokenRef = useRef(0);

  const stop = useCallback(() => {
    tokenRef.current += 1;
    const cancel = cancelRef.current;
    cancelRef.current = null;
    cancel?.();
    setCurrent(null);
  }, []);

  const speak = useCallback(
    (text: string, id?: string) => {
      // lib/speech cancels the previous utterance itself; its onEnd is ignored via the token.
      tokenRef.current += 1;
      const token = tokenRef.current;
      setCurrent({ id: id ?? null });
      cancelRef.current = speakText(text, {
        voiceURI,
        neuralVoice,
        rate,
        onEnd: () => {
          if (tokenRef.current !== token) return;
          cancelRef.current = null;
          setCurrent(null);
        },
      });
    },
    [voiceURI, neuralVoice, rate],
  );

  useEffect(() => {
    const tokens = tokenRef;
    const cancels = cancelRef;
    return () => {
      tokens.current += 1;
      const cancel = cancels.current;
      cancels.current = null;
      cancel?.();
    };
  }, []);

  return { speak, stop, speakingId: current?.id ?? null, speaking: current !== null };
}

const PREFETCH_DELAY_MS = 400;
const TEXT_SEPARATOR = "\u0001";

/**
 * Warms the natural-voice cache for the sentences on screen, so the first tap plays at once.
 * Runs shortly after mount (not competing with the page's own requests) and when the texts change.
 */
export function usePrefetchSpeech(texts: readonly string[], neuralVoice: string | null | undefined): void {
  const joined = texts.join(TEXT_SEPARATOR);
  useEffect(() => {
    if (!neuralVoice || !joined) return;
    const timer = setTimeout(() => prefetchNeuralSpeech(joined.split(TEXT_SEPARATOR), neuralVoice), PREFETCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [joined, neuralVoice]);
}

/* --------------------------------------------------------------- recognizer */

export type ListenState = "idle" | "listening" | "done" | "error";

interface RecognizerSnapshot {
  state: ListenState;
  /** While listening: waiting for the first words, hearing them, or transcribing. */
  phase: ListenPhase | null;
  interim: string;
  alternatives: string[] | null;
  error: RecognitionError | null;
}

const IDLE: RecognizerSnapshot = { state: "idle", phase: null, interim: "", alternatives: null, error: null };

export interface RecognizerStartOptions {
  lang?: string;
  /** How long to wait for the first words. */
  timeoutMs?: number;
  maxMs?: number;
  /** A conversation answer with pauses (see lib/speech ListenOptions.long). */
  long?: boolean;
}

export interface Recognizer extends RecognizerSnapshot {
  start: (opts?: RecognizerStartOptions) => void;
  /** The live mic level 0–1 (recording path), read by a meter on each frame; no re-renders. */
  level: () => number;
  /** Finish now and still deliver what was heard. */
  stop: () => void;
  /** Abort and forget everything. */
  reset: () => void;
}

export function useRecognizer(): Recognizer {
  const [snap, setSnap] = useState<RecognizerSnapshot>(IDLE);
  const stopRef = useRef<StopListening | null>(null);
  const tokenRef = useRef(0);
  const levelRef = useRef(0);
  const level = useCallback(() => levelRef.current, []);

  const abortCurrent = useCallback(() => {
    tokenRef.current += 1;
    const stopFn = stopRef.current;
    stopRef.current = null;
    stopFn?.("abort");
  }, []);

  const start = useCallback(
    (opts?: RecognizerStartOptions) => {
      abortCurrent();
      const token = tokenRef.current;
      const isCurrent = (): boolean => tokenRef.current === token;
      levelRef.current = 0;
      setSnap({ state: "listening", phase: "waiting", interim: "", alternatives: null, error: null });
      stopRef.current = listen({
        lang: opts?.lang,
        timeoutMs: opts?.timeoutMs,
        maxMs: opts?.maxMs,
        long: opts?.long,
        onPhase: (phase) => {
          if (isCurrent()) setSnap((s) => (s.state === "listening" ? { ...s, phase } : s));
        },
        onLevel: (value) => {
          if (isCurrent()) levelRef.current = value;
        },
        onInterim: (text) => {
          if (isCurrent()) setSnap((s) => ({ ...s, interim: text }));
        },
        onResult: (alternatives) => {
          if (isCurrent()) setSnap((s) => ({ ...s, state: "done", alternatives, interim: alternatives[0] ?? s.interim }));
        },
        onError: (error) => {
          if (isCurrent()) setSnap((s) => ({ ...s, state: "error", error }));
        },
        onEnd: () => {
          if (!isCurrent()) return;
          stopRef.current = null;
          levelRef.current = 0;
          setSnap((s) => ({ ...s, phase: null, ...(s.state === "listening" ? { state: "idle" as const } : {}) }));
        },
      });
    },
    [abortCurrent],
  );

  const stop = useCallback(() => {
    stopRef.current?.("stop");
  }, []);

  const reset = useCallback(() => {
    abortCurrent();
    setSnap(IDLE);
  }, [abortCurrent]);

  useEffect(() => abortCurrent, [abortCurrent]);

  return { ...snap, start, stop, reset, level };
}
