"use client";

import { motion } from "motion/react";
import { MicIcon, StopIcon } from "@/components/ui/Icons";
import type { SpokenResult } from "@/lib/answers";
import type { ListenState, } from "@/hooks/useSpeech";
import type { RecognitionError } from "@/lib/speech";

/** What the recogniser heard, word by word. Missed words are underlined — not colour only. */
export function SpokenFeedback({ result }: { result: SpokenResult }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      className={`rounded-md px-4 py-3 ${result.correct ? "bg-good-soft" : "bg-warm-soft"}`}
      role="status"
    >
      <p className={`text-sm font-medium ${result.correct ? "text-good" : "text-warm"}`}>
        {result.correct ? "Clear. That sounded right." : "Almost. Listen once more and try again."}
      </p>
      <p className="mt-1 text-base leading-7 text-text">
        {result.words.map((w, i) => (
          <span key={i}>
            {i > 0 && " "}
            {w.heard ? (
              w.word
            ) : (
              <span className="underline decoration-warm decoration-2 underline-offset-4">
                {w.word}
                <span className="sr-only"> (not heard)</span>
              </span>
            )}
          </span>
        ))}
      </p>
    </motion.div>
  );
}

export function recognitionMessage(error: RecognitionError): string {
  switch (error) {
    case "not-allowed":
      return "The microphone is blocked. Allow it in the browser, or just say it aloud.";
    case "no-speech":
      return "I didn't hear anything. Tap the mic and speak a little louder.";
    case "network":
      return "Speech recognition can't reach its server right now. Say it aloud anyway.";
    case "unsupported":
      return "This browser can't listen. Say it aloud — it still counts.";
    default:
      return "That didn't come through. Try once more.";
  }
}

/** Big round mic button. Breathes gently while listening. */
export function MicButton({
  state,
  onStart,
  onStop,
  label = "Speak",
  size = "lg",
}: {
  state: ListenState;
  onStart: () => void;
  onStop: () => void;
  label?: string;
  size?: "lg" | "md";
}) {
  const listening = state === "listening";
  const dim = size === "lg" ? "size-20" : "size-12";
  return (
    <motion.button
      type="button"
      onClick={listening ? onStop : onStart}
      aria-label={listening ? "Stop listening" : label}
      aria-pressed={listening}
      animate={listening ? { scale: [1, 1.05, 1] } : { scale: 1 }}
      transition={listening ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
      className={`press relative inline-flex ${dim} shrink-0 items-center justify-center rounded-full shadow-2 ${
        listening ? "bg-accent text-accent-ink" : "bg-surface text-accent-text border border-line hover:border-line-strong"
      }`}
    >
      {listening && (
        <span aria-hidden="true" className="absolute inset-0 rounded-full ring-8 ring-accent/15" />
      )}
      {listening ? <StopIcon size={size === "lg" ? 26 : 18} /> : <MicIcon size={size === "lg" ? 30 : 20} />}
    </motion.button>
  );
}
