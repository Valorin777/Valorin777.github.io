"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSpeech } from "@/components/speech/SpeechProvider";
import { Button, LinkButton } from "@/components/ui/Button";
import { CloseIcon, LockIcon } from "@/components/ui/Icons";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Skeleton } from "@/components/ui/Skeleton";
import { FinalScreen } from "@/components/final/FinalScreen";
import { findTopic, getDay, getFinal, listDays } from "@/content";
import type { Day } from "@/lib/content/schema";
import { getDayProgress, isDayUnlocked } from "@/lib/progress";
import {
  buildSteps,
  firstUndoneIndex,
  formatMinutes,
  progressRatio,
  remainingSeconds,
  SECTION_LABELS,
  stepIndexById,
  type Step,
} from "@/lib/steps";
import { actions, getState, useAppState, useHydrated } from "@/lib/store";
import { DoneStep, ReviewStep } from "./DayEndSteps";
import { ExerciseStep } from "./ExerciseStep";
import { ListenStep } from "./ListenStep";
import { SpeakStep } from "./SpeakStep";
import { MistakesStepView, RuleStepView, RuNoteStepView } from "./TheorySteps";

export function LessonScreen({ dayNumber }: { dayNumber: number }) {
  const hydrated = useHydrated();
  const state = useAppState();
  const meta = listDays().find((m) => m.number === dayNumber);
  const day = getDay(dayNumber);
  const final = dayNumber === 7 ? getFinal() : null;

  if (!hydrated) return <LessonSkeleton />;

  if (!meta || (!day && !final)) {
    return (
      <CalmMessage
        title={meta ? `Day ${dayNumber} arrives in the next update.` : "This day doesn't exist."}
        text={meta ? `${meta.title} — ${meta.subtitle}` : "The course has seven days."}
        action={
          <LinkButton href="/" full>
            Back home
          </LinkButton>
        }
      />
    );
  }

  if (!isDayUnlocked(state, dayNumber)) {
    return (
      <CalmMessage
        icon={<LockIcon size={22} />}
        title={`Day ${dayNumber} opens after Day ${dayNumber - 1}.`}
        text="Each day builds on the one before. You can still open it now if you already know the earlier material."
        action={
          <div className="grid gap-3">
            <LinkButton href={`/day/${dayNumber - 1}/`} full>
              Go to Day {dayNumber - 1}
            </LinkButton>
            <Button variant="quiet" full onClick={() => actions.setOverride(dayNumber)}>
              Open Day {dayNumber} anyway
            </Button>
          </div>
        }
      />
    );
  }

  // Started over (here, in another tab or on another device): the open day starts from scratch
  // instead of carrying on and writing back what was just cleared.
  const resetKey = `${state.resetAt ?? ""}|${state.dayResets[dayNumber] ?? ""}`;
  if (final) return <FinalScreen key={resetKey} day={final} />;
  if (!day) return null;
  return <LessonPlayer key={resetKey} day={day} />;
}

function initialIndex(day: Day, steps: Step[]): number {
  const s = getState();
  if (s.position?.day === day.number) {
    const i = stepIndexById(steps, s.position.stepId);
    if (i >= 0) return i;
  }
  return firstUndoneIndex(steps, getDayProgress(s, day.number).doneSteps);
}

function LessonPlayer({ day }: { day: Day }) {
  const steps = useMemo(() => buildSteps(day), [day]);
  const [index, setIndex] = useState(() => initialIndex(day, steps));
  const [dir, setDir] = useState(1);
  const progress = getDayProgress(useAppState(), day.number);
  const { stop } = useSpeech();
  const step = steps[index];

  useEffect(() => {
    actions.startDay(day.number);
  }, [day.number]);

  // Remember the exact step, so "Continue" on the home screen lands here.
  useEffect(() => {
    actions.setPosition(day.number, steps[index].id);
  }, [day.number, steps, index]);

  // Time on task, counted only while the tab is visible.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") actions.addSeconds(day.number, 15);
    }, 15000);
    return () => window.clearInterval(id);
  }, [day.number]);

  const top = useRef<HTMLDivElement>(null);
  const go = useCallback(
    (to: number) => {
      stop();
      setDir(to >= index ? 1 : -1);
      setIndex(Math.max(0, Math.min(steps.length - 1, to)));
      window.scrollTo({ top: 0 });
      top.current?.focus({ preventScroll: true });
    },
    [index, steps.length, stop],
  );

  const next = useCallback(() => {
    const following = steps[index + 1];
    actions.completeStep(day.number, steps[index].id, following?.id ?? null);
    if (following) go(index + 1);
  }, [day.number, go, index, steps]);

  const back = index > 0 ? () => go(index - 1) : undefined;

  // The "done" step completes the day as soon as it is shown.
  useEffect(() => {
    if (step.kind === "done") actions.completeStep(day.number, "done", null);
  }, [step.kind, day.number]);

  const ratio = progressRatio(steps, progress.doneSteps);
  const left = remainingSeconds(steps, progress.doneSteps);
  const topic = "topicId" in step ? findTopic(day, step.topicId) : undefined;

  let content: ReactNode = null;
  switch (step.kind) {
    case "rule":
      if (topic) content = <RuleStepView topic={topic} card={topic.rules[step.cardIndex]} stepId={step.id} onNext={next} onBack={back} />;
      break;
    case "mistakes":
      if (topic) content = <MistakesStepView topic={topic} stepId={step.id} onNext={next} onBack={back} />;
      break;
    case "ruNote":
      if (topic) content = <RuNoteStepView topic={topic} stepId={step.id} onNext={next} onBack={back} />;
      break;
    case "exercise":
      if (topic)
        content = <ExerciseStep day={day.number} topic={topic} ex={topic.exercises[step.exerciseIndex]} stepId={step.id} onNext={next} />;
      break;
    case "listen":
      if (topic) content = <ListenStep topic={topic} stepId={step.id} onNext={next} />;
      break;
    case "speak":
      content = (
        <SpeakStep
          day={day.number}
          item={day.speak[step.itemIndex]}
          index={step.itemIndex}
          total={day.speak.length}
          stepId={step.id}
          onNext={next}
        />
      );
      break;
    case "review":
      content = <ReviewStep day={day} onNext={next} />;
      break;
    case "done":
      content = <DoneStep day={day} onRestart={() => go(0)} />;
      break;
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 bg-bg/90 pt-safe backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-3 px-3 sm:px-5">
          <Link
            href="/"
            aria-label="Pause and go home. Progress is saved."
            title="Pause — progress is saved"
            className="press inline-flex size-12 items-center justify-center rounded-full text-text-2 hover:bg-surface-2 hover:text-text"
          >
            <CloseIcon />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate font-medium text-text-2">
                Day {day.number} · {SECTION_LABELS[step.section]}
              </span>
              <span className="shrink-0 tabular text-text-3">
                {step.kind === "done" ? "Done" : `${formatMinutes(left)} left`}
              </span>
            </div>
            <div className="mt-2">
              <ProgressBar value={ratio} label={`Day ${day.number} progress`} />
            </div>
          </div>
          <span className="w-3" aria-hidden="true" />
        </div>
      </header>

      <div ref={top} tabIndex={-1} className="outline-none" aria-live="off">
        <motion.main
          key={step.id}
          initial={{ opacity: 0, x: dir * 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
        >
          {content}
        </motion.main>
      </div>
    </div>
  );
}

function CalmMessage({
  icon,
  title,
  text,
  action,
}: {
  icon?: ReactNode;
  title: string;
  text: string;
  action: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 pt-safe pb-safe">
      {icon && (
        <span className="mb-6 inline-flex size-12 items-center justify-center rounded-full bg-surface-2 text-text-2">{icon}</span>
      )}
      <h1 className="text-2xl text-text">{title}</h1>
      <p className="mt-3 text-base text-text-2">{text}</p>
      <div className="mt-10">{action}</div>
    </main>
  );
}

function LessonSkeleton() {
  return (
    <div className="min-h-dvh" aria-busy="true" aria-label="Loading the lesson">
      <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-3 px-3 pt-safe sm:px-5">
        <span className="size-12" />
        <Skeleton className="h-1 flex-1" />
      </div>
      <div className="mx-auto w-full max-w-[var(--container-reading)] px-5 pt-10">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-4 h-8 w-3/4" />
        <Skeleton className="mt-8 h-5 w-full" />
        <Skeleton className="mt-3 h-5 w-11/12" />
        <Skeleton className="mt-3 h-5 w-4/5" />
      </div>
    </div>
  );
}
