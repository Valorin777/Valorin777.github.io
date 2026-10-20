"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChoiceView } from "@/components/exercises/ChoiceView";
import { ErrorTapView } from "@/components/exercises/ErrorTapView";
import { FillView } from "@/components/exercises/FillView";
import { ReorderView } from "@/components/exercises/ReorderView";
import type { AnswerEvent, ExerciseStatus } from "@/components/exercises/types";
import { Button } from "@/components/ui/Button";
import { ArrowRightIcon } from "@/components/ui/Icons";
import { Kbd, KeyHints } from "@/components/ui/Kbd";
import { useHotkeys } from "@/hooks/useHotkeys";
import { readableExercise } from "@/lib/answers";
import type { Exercise, Topic } from "@/lib/content/schema";
import { buzz } from "@/lib/haptics";
import { playCue } from "@/lib/sound";
import { actions, useAppState } from "@/lib/store";
import { FeedbackPanel } from "./FeedbackPanel";
import { StepFrame } from "./StepFrame";

const INSTRUCTIONS: Record<Exercise["type"], string> = {
  choice: "Choose the right form",
  collocation: "Choose the natural partner",
  fill: "Type the missing words",
  errorTap: "Tap the word that's wrong",
  reorder: "Put the words in order",
};

const TAP_TO_ANSWER = new Set<Exercise["type"]>(["choice", "collocation", "errorTap"]);

export function ExerciseStep({
  day,
  topic,
  ex,
  stepId,
  onNext,
  onResult,
  eyebrow,
}: {
  day: number;
  topic: Pick<Topic, "title" | "category">;
  ex: Exercise;
  stepId: string;
  onNext: () => void;
  /** Called once with the result (drills count their score with it). */
  onResult?: (correct: boolean) => void;
  /** Overrides the topic title above the instruction. */
  eyebrow?: string;
}) {
  const settings = useAppState().settings;
  const [status, setStatus] = useState<ExerciseStatus>("answering");
  const [given, setGiven] = useState("");
  const [close, setClose] = useState(false);
  const [submit, setSubmit] = useState<(() => void) | null>(null);
  const timer = useRef<number | null>(null);

  const registerSubmit = useCallback((fn: (() => void) | null) => setSubmit(() => fn), []);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const next = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    onNext();
  }, [onNext]);

  const onAnswer = (a: AnswerEvent) => {
    if (status !== "answering") return;
    setStatus(a.correct ? "correct" : "wrong");
    setGiven(a.given);
    setClose(Boolean(a.close));
    const r = readableExercise(ex);
    actions.recordAnswer({
      day,
      key: ex.id,
      correct: a.correct,
      category: topic.category,
      prompt: r.prompt,
      given: a.given,
      right: r.answer,
      rule: ex.rule,
    });
    onResult?.(a.correct);
    if (settings.sound) playCue(a.correct ? "correct" : "close");
    if (settings.haptics) buzz(a.correct ? "correct" : "close");
    // Auto-advance after a right answer: a short beat to see it, longer if there was a typo.
    if (a.correct) timer.current = window.setTimeout(next, a.close ? 1800 : 1000);
  };

  const answered = status !== "answering";
  useHotkeys({
    Enter: () => {
      if (answered) next();
      else submit?.();
    },
  });

  const props = { status, onAnswer, registerSubmit };
  let view: ReactNode;
  switch (ex.type) {
    case "choice":
    case "collocation":
      view = <ChoiceView ex={ex} {...props} />;
      break;
    case "fill":
      view = <FillView ex={ex} {...props} />;
      break;
    case "errorTap":
      view = <ErrorTapView ex={ex} {...props} />;
      break;
    case "reorder":
      view = <ReorderView ex={ex} {...props} />;
      break;
  }

  const tapType = TAP_TO_ANSWER.has(ex.type);
  const action = answered ? (
    <Button full onClick={next} variant={status === "correct" ? "secondary" : "primary"}>
      Continue
      <ArrowRightIcon size={20} />
    </Button>
  ) : tapType ? (
    <p className="flex h-14 items-center justify-center text-sm text-text-3">
      {ex.type === "errorTap" ? "Tap one word" : "Tap an answer"}
    </p>
  ) : (
    <Button full onClick={() => submit?.()} disabled={!submit}>
      Check
    </Button>
  );

  return (
    <StepFrame
      eyebrow={eyebrow ?? topic.title}
      title={INSTRUCTIONS[ex.type]}
      action={action}
      hints={
        <KeyHints>
          {tapType && !answered && ex.type !== "errorTap" ? (
            <>
              <Kbd>1</Kbd>–<Kbd>{ex.type === "choice" || ex.type === "collocation" ? ex.options.length : 4}</Kbd> choose ·{" "}
            </>
          ) : null}
          <Kbd>Enter</Kbd> {answered ? "continue" : "check"}
        </KeyHints>
      }
    >
      {view}
      <FeedbackPanel ex={ex} topic={topic} status={status} given={given} close={close} stepId={stepId} />
    </StepFrame>
  );
}
