"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  getSupport,
  listen,
  loadVoices,
  speak as speakText,
  subscribeVoices,
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

export function useSpeaker(opts: { voiceURI: string | null; rate: number }): Speaker {
  const { voiceURI, rate } = opts;
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
        rate,
        onEnd: () => {
          if (tokenRef.current !== token) return;
          cancelRef.current = null;
          setCurrent(null);
        },
      });
    },
    [voiceURI, rate],
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

/* --------------------------------------------------------------- recognizer */

export type ListenState = "idle" | "listening" | "done" | "error";

interface RecognizerSnapshot {
  state: ListenState;
  interim: string;
  alternatives: string[] | null;
  error: RecognitionError | null;
}

const IDLE: RecognizerSnapshot = { state: "idle", interim: "", alternatives: null, error: null };

export interface Recognizer extends RecognizerSnapshot {
  start: (opts?: { lang?: string; timeoutMs?: number }) => void;
  /** Finish now and still deliver what was heard. */
  stop: () => void;
  /** Abort and forget everything. */
  reset: () => void;
}

export function useRecognizer(): Recognizer {
  const [snap, setSnap] = useState<RecognizerSnapshot>(IDLE);
  const stopRef = useRef<StopListening | null>(null);
  const tokenRef = useRef(0);

  const abortCurrent = useCallback(() => {
    tokenRef.current += 1;
    const stopFn = stopRef.current;
    stopRef.current = null;
    stopFn?.("abort");
  }, []);

  const start = useCallback(
    (opts?: { lang?: string; timeoutMs?: number }) => {
      abortCurrent();
      const token = tokenRef.current;
      const isCurrent = (): boolean => tokenRef.current === token;
      setSnap({ state: "listening", interim: "", alternatives: null, error: null });
      stopRef.current = listen({
        lang: opts?.lang,
        timeoutMs: opts?.timeoutMs,
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
          setSnap((s) => (s.state === "listening" ? { ...s, state: "idle" } : s));
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

  return { ...snap, start, stop, reset };
}
