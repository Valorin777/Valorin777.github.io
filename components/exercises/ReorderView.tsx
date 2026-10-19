"use client";

import { LayoutGroup, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { checkReorder, reorderSentence, shuffleFor } from "@/lib/answers";
import type { ReorderExercise } from "@/lib/content/schema";
import type { ExerciseViewProps } from "./types";

const chipSpring = { type: "spring", duration: 0.25, bounce: 0 } as const;

export function ReorderView({ ex, status, onAnswer, registerSubmit }: ExerciseViewProps<ReorderExercise>) {
  // Words are tracked by their index in ex.words so repeated words ("the … the") stay distinct.
  const bank = useMemo(() => shuffleFor(ex.id, ex.words.map((_, i) => i)), [ex.id, ex.words]);
  const [placed, setPlaced] = useState<number[]>([]);
  const answered = status !== "answering";
  const remaining = bank.filter((i) => !placed.includes(i));

  const submit = () => {
    if (answered || placed.length !== ex.words.length) return;
    const order = placed.map((i) => ex.words[i]);
    onAnswer({ given: reorderSentence(order, ex.end), correct: checkReorder(order, ex) });
  };
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });
  const ready = !answered && placed.length === ex.words.length;
  useEffect(() => {
    registerSubmit(ready ? () => submitRef.current() : null);
  }, [ready, registerSubmit]);

  const chip = (i: number, where: "line" | "bank") => (
    <motion.button
      key={i}
      layoutId={`${ex.id}-w${i}`}
      transition={chipSpring}
      type="button"
      disabled={answered}
      onClick={() =>
        setPlaced((p) => (where === "bank" ? [...p, i] : p.filter((x) => x !== i)))
      }
      aria-label={where === "bank" ? `Add “${ex.words[i]}”` : `Remove “${ex.words[i]}”`}
      className={`min-h-12 rounded-sm border px-3.5 py-2 text-lg shadow-1 disabled:opacity-100 ${
        answered
          ? status === "correct"
            ? "border-good/40 bg-good-soft text-good"
            : "border-warm/40 bg-warm-soft text-text"
          : "border-line bg-surface text-text hover:border-line-strong"
      }`}
    >
      {ex.words[i]}
    </motion.button>
  );

  return (
    <LayoutGroup id={ex.id}>
      <div
        aria-label="Your sentence"
        className="flex min-h-[4.25rem] flex-wrap content-start gap-2 border-b-2 border-dashed border-line-strong pb-3"
      >
        {placed.length === 0 && <span className="self-center px-1 text-base text-text-3">Tap the words in order</span>}
        {placed.map((i) => chip(i, "line"))}
        {placed.length > 0 && <span className="self-end pb-2 text-lg text-text-3">{ex.end ?? "."}</span>}
      </div>
      <div aria-label="Words" className="mt-6 flex min-h-12 flex-wrap gap-2">
        {remaining.map((i) => chip(i, "bank"))}
      </div>
      {answered && status === "wrong" && (
        <p className="mt-6 text-lg text-text">
          <span className="mr-2 text-xs font-medium tracking-[0.06em] text-good uppercase">Natural</span>
          {reorderSentence(ex.words, ex.end)}
        </p>
      )}
    </LayoutGroup>
  );
}
