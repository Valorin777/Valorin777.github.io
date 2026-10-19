"use client";

import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ReviewSession } from "@/components/review/ReviewSession";
import { Button, LinkButton } from "@/components/ui/Button";
import { ArrowRightIcon, FlameIcon } from "@/components/ui/Icons";
import { Kbd, KeyHints } from "@/components/ui/Kbd";
import { listDays } from "@/content";
import { useHotkeys } from "@/hooks/useHotkeys";
import type { Day } from "@/lib/content/schema";
import { today } from "@/lib/date";
import { getDayProgress, isDayUnlocked, topicMastery } from "@/lib/progress";
import { playCue } from "@/lib/sound";
import { dueSorted } from "@/lib/srs";
import { actions, getState, useAppState } from "@/lib/store";
import { StepFrame } from "./StepFrame";

const REVIEW_CAP = 20;

/** End-of-day flashcards: today's mistakes and new phrases, plus anything else due. */
export function ReviewStep({ day, onNext }: { day: Day; onNext: () => void }) {
  const [queue, setQueue] = useState<string[] | null>(null);

  useEffect(() => {
    actions.addPhraseCards(day.number, day.phrases);
    const s = getState();
    const due = dueSorted(Object.values(s.cards), today());
    // Today's cards first, so the day's own material is never cut off by the cap.
    const ordered = [...due.filter((c) => c.day === day.number), ...due.filter((c) => c.day !== day.number)];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- snapshot taken once when the step opens
    setQueue(ordered.slice(0, REVIEW_CAP).map((c) => c.id));
  }, [day]);

  if (!queue) {
    return (
      <StepFrame eyebrow="Review" title="Today's cards" action={<Button full disabled>Show answer</Button>}>
        <div className="skeleton h-56 rounded-lg" />
      </StepFrame>
    );
  }

  return (
    <ReviewSession
      queue={queue}
      onFinish={onNext}
      finishLabel="Finish the day"
      layout={(body, action, hints) => (
        <StepFrame eyebrow="Review" title="Today's cards" action={action} hints={hints}>
          <p className="-mt-2 mb-6 text-base text-text-2">
            Your mistakes and today&apos;s new phrases. Be honest with the grades — it decides when each card comes back.
          </p>
          {body}
        </StepFrame>
      )}
    />
  );
}

export function DoneStep({ day, onRestart }: { day: Day; onRestart: () => void }) {
  const state = useAppState();
  const progress = getDayProgress(state, day.number);
  const mastery = topicMastery(day, progress);
  const minutes = Math.max(1, Math.round(progress.seconds / 60));
  const cardsToday = Object.values(state.cards).filter((c) => c.day === day.number).length;
  const nextMeta = listDays().find((m) => m.number === day.number + 1);
  const nextOpen = nextMeta?.available && isDayUnlocked(state, nextMeta.number);

  useEffect(() => {
    if (getState().settings.sound) playCue("done");
  }, []);

  const primaryHref = nextOpen ? `/day/${nextMeta.number}/` : "/";
  const router = useRouter();
  useHotkeys({ Enter: () => router.push(primaryHref) });

  return (
    <StepFrame
      eyebrow={`Day ${day.number} complete`}
      title={`${day.title}: done.`}
      action={
        <LinkButton href={primaryHref} full>
          {nextOpen ? `Start Day ${nextMeta.number}` : "Back home"}
          <ArrowRightIcon size={20} />
        </LinkButton>
      }
      hints={
        <KeyHints>
          <Kbd>Enter</Kbd> {nextOpen ? "next day" : "home"}
        </KeyHints>
      }
    >
      <p className="text-lesson text-text-2">{day.goal}</p>

      <dl className="mt-8 grid grid-cols-3 gap-3">
        <Stat label="Minutes" value={String(minutes)} />
        <Stat
          label="Streak"
          value={
            <span className="inline-flex items-center gap-1">
              <FlameIcon size={20} className="text-warm" />
              {state.streak.current}
            </span>
          }
        />
        <Stat label="Cards" value={String(cardsToday)} />
      </dl>

      <h2 className="mt-10 font-sans text-xs font-medium tracking-[0.08em] text-text-3 uppercase">First-try accuracy</h2>
      <ul className="mt-4 grid gap-5">
        {mastery.map((m, i) => {
          const topic = day.topics.find((t) => t.id === m.topicId);
          const answered = Boolean(topic?.exercises.some((e) => progress.answers[e.id]));
          const pct = Math.round(m.ratio * 100);
          return (
            <li key={m.topicId}>
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="text-text">{m.title}</span>
                <span className="tabular text-text-2">{answered ? `${pct}%` : "not practised"}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                <motion.div
                  className="h-full w-full origin-left rounded-full bg-accent"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: m.ratio }}
                  transition={{ duration: 0.4, delay: 0.1 + i * 0.04, ease: [0.23, 1, 0.32, 1] }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-10 text-base text-text-2">
        {nextMeta && !nextMeta.available
          ? `Day ${nextMeta.number} — ${nextMeta.title} — arrives in the next update. Until then: review your cards and talk with the coach.`
          : "Tomorrow, start with your cards: they are scheduled for the moment you are about to forget them."}
      </p>
      <div className="mt-6">
        <Button variant="quiet" size="md" onClick={onRestart} className="-ml-3">
          Go through the day again
        </Button>
      </div>
    </StepFrame>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3 shadow-1">
      <dt className="text-xs text-text-3">{label}</dt>
      <dd className="mt-1 font-serif text-2xl text-text tabular">{value}</dd>
    </div>
  );
}
