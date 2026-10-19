"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { SpeakerIcon, StopIcon } from "@/components/ui/Icons";
import { IconButton } from "@/components/ui/Button";
import { stripMarkup } from "@/components/ui/RichText";
import { useSpeaker, useSpeechSupport } from "@/hooks/useSpeech";
import type { SpeechSupport } from "@/lib/speech";
import { useAppState } from "@/lib/store";

interface SpeechApi {
  support: SpeechSupport | null;
  speak: (text: string, id?: string) => void;
  stop: () => void;
  speakingId: string | null;
}

const SpeechContext = createContext<SpeechApi>({
  support: null,
  speak: () => {},
  stop: () => {},
  speakingId: null,
});

/** One speaker for the whole screen, so only one sentence plays at a time. */
export function SpeechProvider({ children }: { children: ReactNode }) {
  const { voiceURI, rate, neuralVoice } = useAppState().settings;
  const support = useSpeechSupport();
  const { speak, stop, speakingId } = useSpeaker({ voiceURI, rate, neuralVoice });
  const value = useMemo(() => ({ support, speak, stop, speakingId }), [support, speak, stop, speakingId]);
  return <SpeechContext.Provider value={value}>{children}</SpeechContext.Provider>;
}

export function useSpeech(): SpeechApi {
  return useContext(SpeechContext);
}

/** Play/stop toggle for one sentence. Renders nothing when the browser cannot speak. */
export function PlayButton({
  text,
  id,
  tone = "plain",
  className = "",
}: {
  text: string;
  id: string;
  tone?: "plain" | "soft";
  className?: string;
}) {
  const { support, speak, stop, speakingId } = useSpeech();
  if (!support?.tts) return null;
  const playing = speakingId === id;
  const plain = stripMarkup(text);
  return (
    <IconButton
      label={playing ? "Stop" : `Listen: ${plain}`}
      active={playing}
      tone={tone}
      className={className}
      onClick={() => (playing ? stop() : speak(plain, id))}
    >
      {playing ? <StopIcon size={20} /> : <SpeakerIcon size={21} />}
    </IconButton>
  );
}
