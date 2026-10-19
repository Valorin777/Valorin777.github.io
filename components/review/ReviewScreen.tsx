"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SpeechProvider } from "@/components/speech/SpeechProvider";
import { LinkButton } from "@/components/ui/Button";
import { ArrowLeftIcon } from "@/components/ui/Icons";
import { Skeleton } from "@/components/ui/Skeleton";
import { diffDays, today } from "@/lib/date";
import { dueSorted } from "@/lib/srs";
import { getState, useAppState, useHydrated } from "@/lib/store";
import { ReviewSession } from "./ReviewSession";

const SESSION_CAP = 40;

export function ReviewScreen() {
  const hydrated = useHydrated();
  return (
    <main className="mx-auto w-full max-w-[var(--container-reading)] px-5 pt-safe pb-16">
      <header className="flex h-16 items-center gap-2">
        <Link
          href="/"
          aria-label="Back home"
          className="press -ml-3 inline-flex size-12 items-center justify-center rounded-full text-text-2 hover:bg-surface-2 hover:text-text"
        >
          <ArrowLeftIcon />
        </Link>
        <h1 className="text-lg text-text">Review</h1>
      </header>
      <div className="mt-4">{hydrated ? <ReviewBody /> : <Skeleton className="h-64 rounded-lg" />}</div>
    </main>
  );
}

function ReviewBody() {
  const router = useRouter();
  const state = useAppState();
  // Snapshot the queue once; grading changes due dates, the session should not reshuffle.
  const [queue] = useState(() => dueSorted(Object.values(getState().cards), today()).slice(0, SESSION_CAP).map((c) => c.id));
  const total = Object.keys(state.cards).length;

  if (total === 0) {
    return (
      <Empty
        title="No cards yet."
        text="They appear as you study: every mistake and every new phrase becomes a card, scheduled to come back just before you forget it."
      />
    );
  }

  if (queue.length === 0) {
    const upcoming = Object.values(state.cards)
      .map((c) => c.due)
      .sort()[0];
    const inDays = upcoming ? diffDays(today(), upcoming) : null;
    return (
      <Empty
        title="Nothing due. Your cards are resting."
        text={
          inDays === null
            ? "Come back after your next lesson."
            : `The next one comes back ${inDays <= 1 ? "tomorrow" : `in ${inDays} days`}. You have ${total} card${total === 1 ? "" : "s"} in total.`
        }
      />
    );
  }

  return (
    <SpeechProvider>
      <ReviewSession queue={queue} onFinish={() => router.push("/")} finishLabel="Back home" />
    </SpeechProvider>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="pt-10">
      <p className="font-serif text-2xl text-text">{title}</p>
      <p className="mt-3 text-base text-text-2">{text}</p>
      <div className="mt-10">
        <LinkButton href="/" full variant="secondary">
          Back home
        </LinkButton>
      </div>
    </div>
  );
}
