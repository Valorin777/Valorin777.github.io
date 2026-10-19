"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PlayButton, useSpeech } from "@/components/speech/SpeechProvider";
import { MicButton, recognitionMessage, SpokenFeedback } from "@/components/speech/SpokenFeedback";
import { Button } from "@/components/ui/Button";
import { ArrowRightIcon } from "@/components/ui/Icons";
import { Kbd, KeyHints } from "@/components/ui/Kbd";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useRecognizer } from "@/hooks/useSpeech";
import { checkSpoken, type SpokenResult } from "@/lib/answers";
import type { SpeakItem } from "@/lib/content/schema";
import { buzz } from "@/lib/haptics";
import { playCue } from "@/lib/sound";
import { actions, useAppState } from "@/lib/store";
import { StepFrame } from "./StepFrame";

/**
 * "Say it in English": Russian on screen, the learner answers aloud, recognition checks it.
 * Without recognition the learner says it, reveals the model and grades themselves.
 */
export function SpeakStep({
  day,
  item,
  index,
  total,
  stepId,
  onNext,
}: {
  day: number;
  item: SpeakItem;
  index: number;
  total: number;
  stepId: string;
  onNext: () => void;
}) {
  const { support, speak } = useSpeech();
  const settings = useAppState().settings;
  const rec = useRecognizer();
  const [result, setResult] = useState<SpokenResult | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const timer = useRef<number | null>(null);
  const model = item.en[0];
  const canListen = Boolean(support?.recognition);

  const record = (correct: boolean, given: string) => {
    actions.recordAnswer({
      day,
      key: item.id,
      correct,
      category: item.category,
      prompt: item.ru,
      given,
      right: model,
      rule: item.focus,
    });
    setRecorded(true);
  };

  useEffect(() => {
    if (rec.state !== "done" || !rec.alternatives) return;
    const r = checkSpoken(rec.alternatives, item.en);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- result of an external recogniser
    setResult(r);
    record(r.correct, rec.alternatives[0] ?? "");
    if (settings.sound) playCue(r.correct ? "correct" : "close");
    if (settings.haptics) buzz(r.correct ? "correct" : "close");
    if (r.correct) {
      setRevealed(true);
      speak(model, `${stepId}:model`);
      timer.current = window.setTimeout(onNext, 2600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to a finished recognition only
  }, [rec.state, rec.alternatives]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const next = () => {
    if (timer.current) window.clearTimeout(timer.current);
    onNext();
  };

  const startListening = () => {
    if (timer.current) window.clearTimeout(timer.current);
    setResult(null);
    rec.start({ timeoutMs: 9000 });
  };

  const reveal = () => {
    setRevealed(true);
    speak(model, `${stepId}:model`);
  };

  const selfGrade = (ok: boolean) => {
    record(ok, ok ? model : "");
    if (settings.sound) playCue(ok ? "correct" : "close");
  };

  const canContinue = Boolean(result?.correct) || (revealed && recorded);
  const needsSelfGrade = revealed && !recorded;

  useHotkeys({
    " ": () => {
      if (!canListen) return;
      if (rec.state === "listening") rec.stop();
      else startListening();
    },
    Enter: () => {
      if (canContinue) next();
      else if (!revealed) reveal();
    },
  });

  let action: ReactNode;
  if (canContinue) {
    action = (
      <Button full onClick={next} variant={result?.correct ? "secondary" : "primary"}>
        Continue
        <ArrowRightIcon size={20} />
      </Button>
    );
  } else if (needsSelfGrade) {
    action = (
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={() => selfGrade(false)}>
          Not quite
        </Button>
        <Button onClick={() => selfGrade(true)}>I said it</Button>
      </div>
    );
  } else {
    action = (
      <Button full variant="secondary" onClick={reveal}>
        Show the answer
      </Button>
    );
  }

  return (
    <StepFrame
      eyebrow={`Say it in English · ${index + 1} of ${total}`}
      action={action}
      hints={
        <KeyHints>
          {canListen ? (
            <>
              <Kbd>Space</Kbd> speak ·{" "}
            </>
          ) : null}
          <Kbd>Enter</Kbd> {revealed ? "continue" : "show answer"}
        </KeyHints>
      }
    >
      <p lang="ru" className="mt-2 font-serif text-2xl text-text">
        {item.ru}
      </p>
      <p className="mt-3 inline-block rounded-sm bg-accent-soft px-2 py-1 text-sm text-accent-text">{item.focus}</p>

      <div className="mt-10 flex flex-col items-center gap-4">
        {canListen ? (
          <>
            <MicButton state={rec.state} onStart={startListening} onStop={rec.stop} label="Say it in English" />
            <p className="min-h-6 text-center text-sm text-text-3" aria-live="polite">
              {rec.state === "listening"
                ? rec.interim || "Listening…"
                : rec.error
                  ? recognitionMessage(rec.error)
                  : result
                    ? ""
                    : "Tap and say it in English"}
            </p>
          </>
        ) : (
          <p className="max-w-sm text-center text-base text-text-2">
            Say it aloud in English, then check yourself.
          </p>
        )}
      </div>

      {result && (
        <div className="mt-6">
          <SpokenFeedback result={result} />
          {!result.correct && !revealed && (
            <div className="mt-3">
              <Button variant="secondary" size="md" onClick={startListening}>
                Try again
              </Button>
            </div>
          )}
        </div>
      )}

      {revealed && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          className="mt-6 flex items-center gap-1 rounded-md border border-line bg-surface p-3 shadow-1"
        >
          <PlayButton text={model} id={`${stepId}:model`} />
          <div className="flex-1">
            <p className="text-lesson text-text">{model}</p>
            {item.en.length > 1 && (
              <p className="mt-0.5 text-sm text-text-3">Also fine: {item.en.slice(1, 3).join(" · ")}</p>
            )}
          </div>
        </motion.div>
      )}
    </StepFrame>
  );
}
