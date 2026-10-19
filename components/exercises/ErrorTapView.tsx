"use client";

import { useState } from "react";
import { checkErrorTap, tokens } from "@/lib/answers";
import type { ErrorTapExercise } from "@/lib/content/schema";
import type { ExerciseViewProps } from "./types";

export function ErrorTapView({ ex, status, onAnswer }: ExerciseViewProps<ErrorTapExercise>) {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = status !== "answering";
  const words = tokens(ex.sentence);

  const pick = (i: number) => {
    if (answered) return;
    setPicked(i);
    onAnswer({ given: words[i], correct: checkErrorTap(i, ex) });
  };

  return (
    <div>
      <p className="-mx-1.5 flex flex-wrap gap-y-1 text-lg sm:text-xl" role="group" aria-label="Words of the sentence">
        {words.map((w, i) => {
          const isWrong = i === ex.wrong;
          const isPicked = i === picked;
          let tone = "text-text hover:bg-accent-soft hover:text-accent-text";
          if (answered && isWrong) tone = isPicked ? "bg-good-soft text-good line-through decoration-2" : "bg-warm-soft text-warm line-through decoration-2";
          else if (answered && isPicked) tone = "bg-surface-3 text-text-2";
          else if (answered) tone = "text-text";
          return (
            <button
              key={i}
              type="button"
              disabled={answered}
              onClick={() => pick(i)}
              aria-label={`${w}${answered && isWrong ? " — this was the wrong word" : ""}`}
              className={`press min-h-12 min-w-12 rounded-sm px-1.5 py-1.5 leading-8 disabled:opacity-100 ${tone}`}
            >
              {w}
            </button>
          );
        })}
      </p>
      {answered && (
        <p className="mt-6 text-lg text-text">
          <span className="mr-2 text-xs font-medium tracking-[0.06em] text-good uppercase">Natural</span>
          {ex.correct}
        </p>
      )}
    </div>
  );
}
