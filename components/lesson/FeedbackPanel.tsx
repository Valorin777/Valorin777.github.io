"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { PlayButton } from "@/components/speech/SpeechProvider";
import { RichText } from "@/components/ui/RichText";
import { Skeleton } from "@/components/ui/Skeleton";
import { aiEnabled, explain } from "@/lib/ai";
import { readableExercise, reorderSentence } from "@/lib/answers";
import type { Exercise, Topic } from "@/lib/content/schema";
import type { ExerciseStatus } from "@/components/exercises/types";

/** The whole correct sentence, for listening. */
export function fullSentence(ex: Exercise): string {
  switch (ex.type) {
    case "choice":
    case "collocation":
      return ex.prompt.replace("___", ex.options[ex.answer]);
    case "fill":
      return `${ex.before} ${ex.answers[0]}${/^[.,!?;:]/.test(ex.after) ? "" : " "}${ex.after}`.trim();
    case "errorTap":
      return ex.correct;
    case "reorder":
      return reorderSentence(ex.words, ex.end);
  }
}

type AiState = { status: "idle" | "loading" | "done" | "failed"; text?: string };

function useAiExplanation(ex: Exercise, topic: Topic, given: string, lang: "en" | "ru", enabled: boolean): AiState {
  const [state, setState] = useState<AiState>({ status: "idle" });
  useEffect(() => {
    if (!enabled || !aiEnabled()) return;
    const ctrl = new AbortController();
    const r = readableExercise(ex);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading state for a request that starts here
    setState({ status: "loading" });
    explain(
      { exerciseId: ex.id, task: r.prompt, given, right: r.answer, rule: ex.rule, category: topic.category, lang },
      ctrl.signal,
    )
      .then((res) => setState({ status: "done", text: res.text }))
      .catch(() => {
        if (!ctrl.signal.aborted) setState({ status: "failed" });
      });
    return () => ctrl.abort();
  }, [ex, topic.category, given, lang, enabled]);
  return state;
}

/**
 * Gentle feedback. Right: one calm line. Not right: the trick — rule, answer, why —
 * plus a personal AI explanation of the learner's own answer that loads in place.
 */
export function FeedbackPanel({
  ex,
  topic,
  status,
  given,
  close,
  stepId,
}: {
  ex: Exercise;
  topic: Topic;
  status: ExerciseStatus;
  given: string;
  close: boolean;
  stepId: string;
}) {
  const [ruOpen, setRuOpen] = useState(false);
  const wrong = status === "wrong";
  const panelRef = useRef<HTMLElement>(null);
  // Bring the trick into view above the action bar; it can sit below the fold on small phones.
  useEffect(() => {
    if (!wrong) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = window.setTimeout(() => panelRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" }), 60);
    return () => window.clearTimeout(id);
  }, [wrong]);
  const ai = useAiExplanation(ex, topic, given, "en", wrong);
  const aiRu = useAiExplanation(ex, topic, given, "ru", wrong && ruOpen && !ex.ruHint);
  if (status === "answering") return null;
  const answer = readableExercise(ex).answer;

  if (!wrong) {
    return (
      <motion.div
        role="status"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        className="mt-8 rounded-md bg-good-soft px-4 py-3"
      >
        <p className="font-medium text-good">{close ? "Right — mind the spelling." : "Right."}</p>
        {close && <p className="mt-0.5 text-base text-text">{answer}</p>}
      </motion.div>
    );
  }

  return (
    <motion.section
      ref={panelRef}
      role="status"
      aria-label="Feedback"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      className="mt-8 scroll-mb-44 rounded-md border border-warm/25 bg-warm-soft p-4 sm:p-5"
    >
      <p className="font-serif text-lg text-text">Close. Here is the trick.</p>
      <p className="mt-2 inline-block rounded-sm bg-surface/70 px-2 py-1 text-sm font-medium text-text">
        <RichText text={ex.rule} />
      </p>
      <div className="mt-3 flex items-center gap-1">
        <p className="flex-1 text-base text-text">
          <span className="mr-2 text-xs font-medium tracking-[0.06em] text-good uppercase">Answer</span>
          {answer}
        </p>
        <PlayButton text={fullSentence(ex)} id={`${stepId}:answer`} className="-my-2 -mr-2" />
      </div>
      <p className="mt-2 text-base text-text-2">
        <RichText text={ex.explain} />
      </p>

      {ai.status === "loading" && (
        <div className="mt-3 grid gap-2" aria-label="Loading a personal explanation">
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}
      {ai.status === "done" && ai.text && (
        <p className="mt-3 border-t border-warm/20 pt-3 text-base text-text">
          <span className="mr-2 text-xs font-medium tracking-[0.06em] text-text-3 uppercase">Your answer</span>
          <RichText text={ai.text} />
        </p>
      )}

      {(ex.ruHint || aiEnabled()) && (
        <div className="mt-3">
          {!ruOpen ? (
            <button
              type="button"
              onClick={() => setRuOpen(true)}
              className="press -ml-2 min-h-11 rounded-sm px-2 text-sm text-text-2 underline decoration-line-strong underline-offset-4 hover:text-text"
            >
              Подсказка по-русски
            </button>
          ) : ex.ruHint ? (
            <p lang="ru" className="text-base text-text-2">
              <RichText text={ex.ruHint} />
            </p>
          ) : aiRu.status === "loading" ? (
            <Skeleton className="h-4 w-3/4" />
          ) : aiRu.text ? (
            <p lang="ru" className="text-base text-text-2">
              <RichText text={aiRu.text} />
            </p>
          ) : (
            <p className="text-sm text-text-3">Подсказка сейчас недоступна.</p>
          )}
        </div>
      )}
    </motion.section>
  );
}
