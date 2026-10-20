"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExerciseStep } from "@/components/lesson/ExerciseStep";
import { StepFrame } from "@/components/lesson/StepFrame";
import { ReviewSession } from "@/components/review/ReviewSession";
import { LinkButton } from "@/components/ui/Button";
import { ArrowRightIcon, CloseIcon } from "@/components/ui/Icons";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Skeleton } from "@/components/ui/Skeleton";
import { DAYS, findTopic, getDay } from "@/content";
import { CATEGORY_LABELS } from "@/lib/content/schema";
import { today } from "@/lib/date";
import { buildDrill, type DrillItem } from "@/lib/drill";
import { getState, useAppState, useHydrated } from "@/lib/store";

/** A short daily drill built from the learner's own mistakes: re-run the exercise, then recall the rest as cards. */
export function DrillScreen() {
  const hydrated = useHydrated();
  const state = useAppState();
  if (!hydrated) {
    return (
      <div className="mx-auto w-full max-w-[var(--container-reading)] px-5 pt-20" aria-busy="true">
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }
  // Started over elsewhere: rebuild the queue instead of answering items from cleared days.
  return <Drill key={`${state.resetAt ?? ""}|${JSON.stringify(state.dayResets)}`} />;
}

function Drill() {
  const router = useRouter();
  const [items] = useState<DrillItem[]>(() => buildDrill(getState(), DAYS, today()));
  const exercises = items.filter((i): i is Extract<DrillItem, { kind: "exercise" }> => i.kind === "exercise");
  const cards = items.filter((i): i is Extract<DrillItem, { kind: "card" }> => i.kind === "card");
  const [index, setIndex] = useState(0);
  const [right, setRight] = useState(0);
  const [phase, setPhase] = useState<"exercises" | "cards" | "done">(exercises.length ? "exercises" : cards.length ? "cards" : "done");
  const total = items.length;

  const next = () => {
    if (index + 1 < exercises.length) setIndex(index + 1);
    else setPhase(cards.length ? "cards" : "done");
    window.scrollTo({ top: 0 });
  };

  if (total === 0) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5">
        <h1 className="text-2xl text-text">Nothing to drill yet.</h1>
        <p className="mt-3 text-base text-text-2">Mistakes from lessons and the coach turn into practice here.</p>
        <div className="mt-10">
          <LinkButton href="/" full>
            Back home
          </LinkButton>
        </div>
      </main>
    );
  }

  const doneCount = phase === "exercises" ? index : phase === "cards" ? exercises.length : total;
  const current = phase === "exercises" ? exercises[index] : null;
  const day = current ? getDay(current.day) : null;
  const topic = day && current ? findTopic(day, current.topicId) : undefined;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 bg-bg/90 pt-safe backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-3 px-3 sm:px-5">
          <Link
            href="/"
            aria-label="Stop the drill and go home"
            className="press inline-flex size-12 items-center justify-center rounded-full text-text-2 hover:bg-surface-2 hover:text-text"
          >
            <CloseIcon />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium text-text-2">Daily drill</span>
              <span className="tabular text-text-3">
                {Math.min(doneCount + (phase === "done" ? 0 : 1), total)} of {total}
              </span>
            </div>
            <div className="mt-2">
              <ProgressBar value={doneCount / total} label="Drill progress" />
            </div>
          </div>
          <span className="w-3" />
        </div>
      </header>

      {phase === "exercises" && current && topic && (
        <motion.div
          key={current.key}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
        >
          <ExerciseStep
            day={current.day}
            topic={topic}
            ex={current.exercise}
            stepId={`drill:${current.key}`}
            eyebrow={`Your mistake · ${CATEGORY_LABELS[topic.category]}`}
            onResult={(ok) => ok && setRight((r) => r + 1)}
            onNext={next}
          />
        </motion.div>
      )}

      {phase === "cards" && (
        <ReviewSession
          queue={cards.map((c) => c.cardId)}
          onFinish={() => setPhase("done")}
          finishLabel="Finish the drill"
          layout={(body, action, hints) => (
            <StepFrame eyebrow="Your mistakes" title="Recall the right form" action={action} hints={hints}>
              {body}
            </StepFrame>
          )}
        />
      )}

      {phase === "done" && (
        <StepFrame
          eyebrow="Daily drill"
          title="Done for today."
          action={
            <LinkButton href="/" full>
              Back home
              <ArrowRightIcon size={20} />
            </LinkButton>
          }
        >
          <p className="text-lesson text-text-2">
            {exercises.length > 0
              ? `${right} of ${exercises.length} right on this pass. The ones you missed come back tomorrow.`
              : "Your mistake cards are rescheduled. They come back just before you forget them."}
          </p>
          <button
            type="button"
            onClick={() => router.push("/mistakes/")}
            className="press mt-6 -ml-2 min-h-11 rounded-sm px-2 text-sm text-text-2 underline decoration-line-strong underline-offset-4 hover:text-text"
          >
            See all your mistakes
          </button>
        </StepFrame>
      )}
    </div>
  );
}
