"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { useSpeech } from "@/components/speech/SpeechProvider";
import { InlineTranslate } from "@/components/translate/InlineTranslate";
import { PlayIcon, StopIcon } from "@/components/ui/Icons";
import { RichText, stripMarkup } from "@/components/ui/RichText";
import type { CoachTip } from "@/lib/ai";
import { TipCard } from "./TipCard";

/** Stable bar heights from the text, so the same reply always draws the same wave. */
function bars(text: string, count = 28): number[] {
  let h = 2166136261;
  return Array.from({ length: count }, (_, i) => {
    h ^= text.charCodeAt(i % Math.max(1, text.length)) + i;
    h = Math.imul(h, 16777619) >>> 0;
    return 0.25 + ((h % 1000) / 1000) * 0.75;
  });
}

/**
 * The coach speaks like a person on the street: you hear the reply, the words stay hidden.
 * Tap the bubble (or "Показать текст") when you didn't catch it.
 */
export function VoiceBubble({
  id,
  text,
  tip,
  revealed,
  onReveal,
}: {
  id: string;
  text: string;
  tip?: CoachTip | null;
  revealed: boolean;
  onReveal: () => void;
}) {
  const { support, speak, stop, speakingId } = useSpeech();
  const [tipOpen, setTipOpen] = useState(false);
  const wave = useMemo(() => bars(text), [text]);
  const playing = speakingId === id;
  const words = stripMarkup(text).split(/\s+/).length;
  const seconds = Math.max(2, Math.round(words / 2.6));
  // Without any voice the text is the only way to hear the coach.
  const showText = revealed || support?.tts === false;

  return (
    <div className="max-w-[34rem]">
      <div className="rounded-lg rounded-tl-sm border border-line bg-surface px-3 py-2.5 shadow-1">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => (playing ? stop() : speak(stripMarkup(text), id))}
            aria-label={playing ? "Stop" : "Play the coach's reply"}
            className="press inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink"
          >
            {playing ? <StopIcon size={18} /> : <PlayIcon size={18} />}
          </button>
          <button
            type="button"
            onClick={onReveal}
            aria-label={showText ? "Reply text is shown" : "Show the reply text"}
            className="flex min-h-11 flex-1 items-center gap-[3px]"
          >
            {wave.map((v, i) => (
              <span
                key={i}
                aria-hidden="true"
                className={`w-[3px] origin-center rounded-full bg-accent/70 ${playing ? "voice-bar" : ""}`}
                style={{ height: `${Math.round(v * 28)}px`, animationDelay: `${(i % 7) * 90}ms` }}
              />
            ))}
          </button>
          <span className="shrink-0 text-xs tabular text-text-3">0:{String(seconds).padStart(2, "0")}</span>
        </div>
        <AnimatePresence initial={false}>
          {showText ? (
            <motion.div
              key="text"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="mt-2 border-t border-line px-1 pt-2"
            >
              <p className="text-lesson text-text">
                <RichText text={text} />
              </p>
              <InlineTranslate text={text} />
            </motion.div>
          ) : (
            <button
              key="reveal"
              type="button"
              onClick={onReveal}
              className="press -ml-1 mt-1 min-h-9 rounded-sm px-1 text-sm text-text-3 underline decoration-line-strong underline-offset-4 hover:text-text-2"
            >
              Показать текст
            </button>
          )}
        </AnimatePresence>
      </div>

      {tip &&
        (tipOpen ? (
          <div className="mr-12">
            <TipCard tip={tip} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setTipOpen(true)}
            className="press mt-2 inline-flex min-h-10 items-center gap-2 rounded-full border border-accent/25 bg-accent-soft px-3 text-sm text-accent-text"
          >
            <span className="text-xs font-medium tracking-[0.08em] uppercase">Фишка</span>
            <span className="max-w-[16rem] truncate">{tip.title}</span>
          </button>
        ))}
    </div>
  );
}
