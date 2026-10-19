"use client";

import { useState } from "react";
import { CheckIcon } from "@/components/ui/Icons";
import { RichText } from "@/components/ui/RichText";
import { useHotkeys } from "@/hooks/useHotkeys";
import { checkChoice } from "@/lib/answers";
import type { ChoiceExercise, CollocationExercise } from "@/lib/content/schema";
import type { ExerciseViewProps } from "./types";

/** Sentence with the gap shown as a quiet blank that fills in once answered. */
export function GapSentence({ prompt, fill, tone }: { prompt: string; fill?: string; tone?: "good" | "warm" }) {
  const parts = prompt.split("___");
  return (
    <p className="text-lg leading-9 text-text sm:text-xl sm:leading-10">
      {parts.map((part, i) => (
        <span key={i}>
          <RichText text={part} />
          {i < parts.length - 1 &&
            (fill ? (
              <span
                className={`rounded-sm px-1.5 py-0.5 font-medium ${tone === "good" ? "bg-good-soft text-good" : "bg-warm-soft text-warm"}`}
              >
                {fill}
              </span>
            ) : (
              <span className="mx-0.5 inline-block w-[4.5ch] translate-y-[-0.2em] border-b-2 border-line-strong" aria-label="blank" />
            ))}
        </span>
      ))}
    </p>
  );
}

export function ChoiceView({ ex, status, onAnswer }: ExerciseViewProps<ChoiceExercise | CollocationExercise>) {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = status !== "answering";

  const pick = (i: number) => {
    if (answered || i >= ex.options.length) return;
    setPicked(i);
    onAnswer({ given: ex.options[i], correct: checkChoice(i, ex) });
  };

  useHotkeys({ "1": () => pick(0), "2": () => pick(1), "3": () => pick(2), "4": () => pick(3) }, !answered);

  const hasGap = ex.prompt.includes("___");
  return (
    <div>
      {hasGap ? (
        <GapSentence
          prompt={ex.prompt}
          fill={answered ? ex.options[ex.answer] : undefined}
          tone={status === "correct" ? "good" : "warm"}
        />
      ) : (
        <p className="text-lg leading-9 text-text sm:text-xl">
          <RichText text={ex.prompt} />
        </p>
      )}

      <div role="group" aria-label="Options" className="mt-8 grid gap-3">
        {ex.options.map((opt, i) => {
          const isRight = i === ex.answer;
          const isPicked = i === picked;
          let tone = "border-line bg-surface hover:border-line-strong hover:bg-surface-2";
          if (answered && isRight) tone = "border-good/40 bg-good-soft";
          else if (answered && isPicked) tone = "border-warm/40 bg-warm-soft";
          else if (answered) tone = "border-line bg-surface opacity-55";
          return (
            <button
              key={i}
              type="button"
              disabled={answered}
              onClick={() => pick(i)}
              aria-label={`${i + 1}. ${opt}${answered && isRight ? " — correct answer" : ""}${answered && isPicked && !isRight ? " — your answer" : ""}`}
              className={`press flex min-h-14 w-full items-center gap-4 rounded-md border px-4 py-3 text-left shadow-1 disabled:opacity-100 ${tone}`}
            >
              <span
                aria-hidden="true"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-line text-xs tabular text-text-3"
              >
                {answered && isRight ? <CheckIcon size={16} strokeWidth={2.25} className="text-good" /> : i + 1}
              </span>
              <span className="text-base text-text sm:text-lg">{opt}</span>
              {answered && isPicked && !isRight && <span className="ml-auto text-xs text-warm">Your answer</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
