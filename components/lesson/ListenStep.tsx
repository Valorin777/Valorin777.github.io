"use client";

import { useEffect, useRef, useState } from "react";
import { PlayButton, useSpeech } from "@/components/speech/SpeechProvider";
import { MicButton, recognitionMessage, SpokenFeedback } from "@/components/speech/SpokenFeedback";
import { Button } from "@/components/ui/Button";
import { ArrowRightIcon, HeadphonesIcon, StopIcon } from "@/components/ui/Icons";
import { Kbd, KeyHints } from "@/components/ui/Kbd";
import { stripMarkup } from "@/components/ui/RichText";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useRecognizer } from "@/hooks/useSpeech";
import { checkSpoken, type SpokenResult } from "@/lib/answers";
import type { Topic } from "@/lib/content/schema";
import { useAppState } from "@/lib/store";
import { StepFrame } from "./StepFrame";

/**
 * Listen and read aloud: every example has play and "repeat" (speech recognition where the
 * browser has it). "Listen and repeat" mode plays each sentence and leaves a pause to shadow it.
 */
export function ListenStep({ topic, stepId, onNext }: { topic: Topic; stepId: string; onNext: () => void }) {
  const { support, speak, stop, speakingId } = useSpeech();
  const showRu = useAppState().settings.showRu;
  const rec = useRecognizer();
  const [current, setCurrent] = useState(0);
  const [results, setResults] = useState<Record<number, SpokenResult>>({});
  const [listeningRow, setListeningRow] = useState<number | null>(null);
  const [auto, setAuto] = useState(false);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const pauseTimer = useRef<number | null>(null);

  const idOf = (i: number) => `${stepId}:${i}`;
  const texts = topic.examples.map((e) => stripMarkup(e.en));

  // Score the repeat when the recogniser returns.
  useEffect(() => {
    if (listeningRow === null) return;
    if (rec.state === "done" && rec.alternatives) {
      const r = checkSpoken(rec.alternatives, [texts[listeningRow]]);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- result of an external recogniser
      setResults((prev) => ({ ...prev, [listeningRow]: r }));
      setListeningRow(null);
    } else if (rec.state === "error") {
      setListeningRow(null);
    }
  }, [rec.state, rec.alternatives, listeningRow, texts]);

  // Listen-and-repeat mode: after each sentence ends, pause about as long as it took, then go on.
  const lastSpoken = useRef<string | null>(null);
  useEffect(() => {
    if (!auto) return;
    if (speakingId) {
      lastSpoken.current = speakingId;
      return;
    }
    if (lastSpoken.current === null) return;
    const i = Number(lastSpoken.current.split(":").pop());
    lastSpoken.current = null;
    const words = texts[i]?.split(" ").length ?? 6;
    pauseTimer.current = window.setTimeout(() => {
      const nextI = i + 1;
      if (nextI >= texts.length) {
        setAuto(false);
        return;
      }
      setCurrent(nextI);
      rowRefs.current[nextI]?.scrollIntoView({ block: "center", behavior: "smooth" });
      speak(texts[nextI], idOf(nextI));
    }, 900 + words * 420);
    return () => {
      if (pauseTimer.current) window.clearTimeout(pauseTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- driven by speakingId transitions only
  }, [speakingId, auto]);

  const startAuto = () => {
    setAuto(true);
    speak(texts[current], idOf(current));
  };
  const stopAuto = () => {
    setAuto(false);
    if (pauseTimer.current) window.clearTimeout(pauseTimer.current);
    stop();
  };

  const repeat = (i: number) => {
    stopAuto();
    setCurrent(i);
    setListeningRow(i);
    rec.start({ timeoutMs: 9000 });
  };

  const move = (d: number) => {
    const n = Math.max(0, Math.min(texts.length - 1, current + d));
    setCurrent(n);
    rowRefs.current[n]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  useHotkeys({
    Enter: () => {
      stopAuto();
      onNext();
    },
    " ": () => (speakingId === idOf(current) ? stop() : speak(texts[current], idOf(current))),
    ArrowDown: () => move(1),
    ArrowUp: () => move(-1),
    r: () => support?.recognition && repeat(current),
  });

  const canListen = Boolean(support?.recognition);

  return (
    <StepFrame
      eyebrow={`Listen & speak · ${topic.title}`}
      title="Listen, then say it aloud"
      action={
        <Button
          full
          onClick={() => {
            stopAuto();
            onNext();
          }}
        >
          Continue
          <ArrowRightIcon size={20} />
        </Button>
      }
      hints={
        <KeyHints>
          <Kbd>Space</Kbd> listen · <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> move {canListen ? <>· <Kbd>R</Kbd> repeat </> : null}· <Kbd>Enter</Kbd> continue
        </KeyHints>
      }
    >
      <p className="text-base text-text-2">
        {canListen
          ? "Play a sentence, then press the mic and repeat it. Aim for the rhythm, not perfection."
          : "Play a sentence, then read it aloud after the voice. Aim for the rhythm, not perfection."}
      </p>
      {support?.tts && (
        <div className="mt-5">
          {auto ? (
            <Button variant="secondary" size="md" onClick={stopAuto}>
              <StopIcon size={18} />
              Stop listen and repeat
            </Button>
          ) : (
            <Button variant="secondary" size="md" onClick={startAuto}>
              <HeadphonesIcon size={20} />
              Listen and repeat, hands-free
            </Button>
          )}
        </div>
      )}

      <ol className="mt-6 grid gap-2">
        {topic.examples.map((ex, i) => {
          const active = i === current;
          const result = results[i];
          return (
            <li
              key={i}
              ref={(el) => {
                rowRefs.current[i] = el;
              }}
              className={`rounded-md border px-1 py-1 transition-colors duration-200 ${
                active ? "border-line-strong bg-surface shadow-1" : "border-transparent"
              }`}
              onFocusCapture={() => setCurrent(i)}
            >
              <div className="flex items-start gap-1">
                <PlayButton text={ex.en} id={idOf(i)} />
                <div className="min-w-0 flex-1 py-2.5" onClick={() => setCurrent(i)}>
                  <p className="text-lesson text-text">{stripMarkup(ex.en)}</p>
                  {(showRu || active) && (
                    <p lang="ru" className="mt-0.5 text-sm text-text-3">
                      {ex.ru}
                    </p>
                  )}
                </div>
                {canListen && (
                  <div className="py-0">
                    <MicButton
                      size="md"
                      state={listeningRow === i ? rec.state : "idle"}
                      onStart={() => repeat(i)}
                      onStop={rec.stop}
                      label={`Repeat: ${stripMarkup(ex.en)}`}
                    />
                  </div>
                )}
              </div>
              {listeningRow === i && rec.state === "listening" && (
                <p className="px-3 pb-2 text-sm text-text-3 italic" aria-live="polite">
                  {rec.interim || "Listening…"}
                </p>
              )}
              {listeningRow === null && rec.error && i === current && !result && (
                <p className="px-3 pb-2 text-sm text-text-2" role="status">
                  {recognitionMessage(rec.error)}
                </p>
              )}
              {result && (
                <div className="px-1 pb-1">
                  <SpokenFeedback result={result} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </StepFrame>
  );
}
