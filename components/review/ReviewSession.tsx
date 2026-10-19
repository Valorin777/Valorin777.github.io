"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { PlayButton, useSpeech } from "@/components/speech/SpeechProvider";
import { Button } from "@/components/ui/Button";
import { Kbd, KeyHints } from "@/components/ui/Kbd";
import { RichText } from "@/components/ui/RichText";
import { useHotkeys } from "@/hooks/useHotkeys";
import { CATEGORY_LABELS } from "@/lib/content/schema";
import { buzz } from "@/lib/haptics";
import { formatInterval, GRADES, previewInterval, type Grade } from "@/lib/srs";
import { actions, useAppState } from "@/lib/store";
import type { Card } from "@/types/state";

const CYRILLIC = /[а-яё]/i;

/** Front may be Russian (phrase cards) or English (mistake cards); the English side is what plays. */
function sides(card: Card): { frontLang: string; english: string } {
  return {
    frontLang: CYRILLIC.test(card.front) ? "ru" : "en",
    english: CYRILLIC.test(card.back) ? card.front : card.back,
  };
}

/**
 * A review run over a fixed queue of card ids (taken when the session starts, so cards do not
 * jump around while grading). "Again" sends a card to the end of this session once more.
 */
export function ReviewSession({
  queue: initialQueue,
  onFinish,
  finishLabel,
  layout,
}: {
  queue: string[];
  onFinish: () => void;
  finishLabel: string;
  /** Lets the caller place the action bar (e.g. inside a lesson StepFrame). */
  layout?: (body: ReactNode, action: ReactNode, hints: ReactNode) => ReactNode;
}) {
  const state = useAppState();
  const { speak } = useSpeech();
  const [queue, setQueue] = useState<string[]>(initialQueue);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [retried] = useState(() => new Set<string>());

  const card = queue.length ? state.cards[queue[0]] : undefined;
  const finished = !card;

  const grade = (g: Grade) => {
    if (!card || !flipped) return;
    actions.reviewCard(card.id, g);
    if (state.settings.haptics) buzz("tap");
    setReviewed((n) => n + 1);
    setFlipped(false);
    setQueue((q) => {
      const rest = q.slice(1);
      if (g < 3 && !retried.has(card.id)) {
        retried.add(card.id);
        return [...rest, card.id];
      }
      return rest;
    });
  };

  const flip = () => {
    if (!card || flipped) return;
    setFlipped(true);
    speak(sides(card).english, `card:${card.id}`);
  };

  useHotkeys({
    " ": () => (flipped && card ? speak(sides(card).english, `card:${card.id}`) : flip()),
    Enter: () => (finished ? onFinish() : flipped ? grade(4) : flip()),
    "1": () => grade(1),
    "2": () => grade(3),
    "3": () => grade(4),
    "4": () => grade(5),
  });

  const action = finished ? (
    <Button full onClick={onFinish}>
      {finishLabel}
    </Button>
  ) : !flipped ? (
    <Button full onClick={flip}>
      Show answer
    </Button>
  ) : (
    <div className="grid grid-cols-4 gap-2" role="group" aria-label="How well did you know it?">
      {GRADES.map((g) => (
        <button
          key={g.grade}
          type="button"
          onClick={() => grade(g.grade)}
          className={`press flex h-14 flex-col items-center justify-center rounded-md border text-sm font-medium shadow-1 ${
            g.grade === 4
              ? "border-accent bg-accent text-accent-ink hover:bg-accent-hover"
              : "border-line bg-surface text-text hover:border-line-strong"
          }`}
        >
          <span>{g.label}</span>
          <span className={`text-[0.6875rem] font-normal ${g.grade === 4 ? "text-accent-ink/80" : "text-text-3"}`}>
            {card ? (g.grade < 3 ? "again now" : formatInterval(previewInterval(card, g.grade))) : ""}
          </span>
        </button>
      ))}
    </div>
  );

  const hints = finished ? null : (
    <KeyHints>
      {flipped ? (
        <>
          <Kbd>1</Kbd>–<Kbd>4</Kbd> grade · <Kbd>Space</Kbd> listen
        </>
      ) : (
        <>
          <Kbd>Space</Kbd> show answer
        </>
      )}
    </KeyHints>
  );

  const body = finished ? (
    <div className="py-10 text-center">
      <p className="font-serif text-2xl text-text">
        {reviewed > 0 ? `${reviewed} card${reviewed === 1 ? "" : "s"} reviewed.` : "Nothing due right now."}
      </p>
      <p className="mt-2 text-base text-text-2">
        {reviewed > 0 ? "They come back when they are about to fade." : "Your cards rest until they are due."}
      </p>
    </div>
  ) : (
    <div>
      <p className="text-sm text-text-3 tabular" aria-live="polite">
        {queue.length} left · {CATEGORY_LABELS[card.category]}
      </p>
      <div className="relative mt-4 [perspective:1400px]">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={card.id + ":" + queue.length}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          >
            <motion.div
              animate={{ rotateY: flipped ? 180 : 0 }}
              transition={{ type: "spring", duration: 0.45, bounce: 0.1 }}
              className="grid [transform-style:preserve-3d]"
            >
              <CardFace lang={sides(card).frontLang} label="Prompt" hidden={flipped}>
                <p className="font-serif text-xl leading-snug text-text sm:text-2xl">
                  <RichText text={card.front} />
                </p>
                <p className="mt-6 text-sm text-text-3">{card.source === "phrase" ? "Say it in English" : "What fits?"}</p>
              </CardFace>
              <CardFace back lang="en" label="Answer" hidden={!flipped}>
                <p className="text-sm text-text-3" lang={sides(card).frontLang}>
                  <RichText text={card.front} />
                </p>
                <div className="mt-3 flex items-center gap-1">
                  <p className="flex-1 font-serif text-xl leading-snug text-text sm:text-2xl">
                    <RichText text={card.back} />
                  </p>
                  <PlayButton text={sides(card).english} id={`card:${card.id}`} className="-mr-2" />
                </div>
                {card.note && (
                  <p className="mt-4 border-t border-line pt-3 text-sm text-text-2">
                    <RichText text={card.note} />
                  </p>
                )}
              </CardFace>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );

  return layout ? (
    layout(body, action, hints)
  ) : (
    <>
      {body}
      <div className="mt-8 grid gap-3">
        {action}
        {hints}
      </div>
    </>
  );
}

function CardFace({
  children,
  back = false,
  lang,
  label,
  hidden,
}: {
  children: ReactNode;
  back?: boolean;
  lang: string;
  label: string;
  hidden: boolean;
}) {
  return (
    <section
      aria-label={label}
      aria-hidden={hidden}
      lang={lang}
      className="col-start-1 row-start-1 min-h-56 rounded-lg border border-line bg-surface p-6 shadow-2 [backface-visibility:hidden] sm:min-h-64 sm:p-8"
      style={back ? { transform: "rotateY(180deg)" } : undefined}
    >
      {children}
    </section>
  );
}
