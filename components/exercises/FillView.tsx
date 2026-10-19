"use client";

import { useEffect, useRef, useState } from "react";
import { RichText } from "@/components/ui/RichText";
import { checkFill } from "@/lib/answers";
import type { FillExercise } from "@/lib/content/schema";
import type { ExerciseViewProps } from "./types";

export function FillView({ ex, status, onAnswer, registerSubmit }: ExerciseViewProps<FillExercise>) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const answered = status !== "answering";
  const width = Math.max(6, ...ex.answers.map((a) => a.length)) + 1;

  const submit = () => {
    if (answered || !value.trim()) return;
    const r = checkFill(value, ex);
    onAnswer({ given: value.trim(), correct: r.correct, close: r.close });
  };

  // Register the latest submit with the step's Check button.
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });
  const ready = !answered && value.trim().length > 0;
  useEffect(() => {
    registerSubmit(ready ? () => submitRef.current() : null);
  }, [ready, registerSubmit]);

  useEffect(() => {
    // Desktop: focus straight away. Touch devices: let the learner read first.
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) inputRef.current?.focus();
  }, []);

  const tone =
    status === "correct"
      ? "border-good bg-good-soft text-good"
      : status === "wrong"
        ? "border-warm bg-warm-soft text-warm"
        : "border-line-strong bg-surface text-text focus:border-accent";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="text-lg leading-[2.75rem] text-text sm:text-xl sm:leading-[3rem]">
        {ex.before && (
          <>
            <RichText text={ex.before} />{" "}
          </>
        )}
        <label className="sr-only" htmlFor={`fill-${ex.id}`}>
          Missing words{ex.base ? `, from “${ex.base}”` : ""}
        </label>
        <input
          ref={inputRef}
          id={`fill-${ex.id}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          readOnly={answered}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          size={width}
          style={{ width: `${width}ch` }}
          className={`h-11 max-w-full rounded-sm border-2 px-2 align-baseline text-lg font-medium outline-none transition-colors duration-150 sm:text-xl ${tone}`}
        />
        {ex.base && <span className="ml-1.5 text-base text-text-3">({ex.base})</span>}
        {ex.after && (
          <>
            {/^[.,!?;:]/.test(ex.after) ? "" : " "}
            <RichText text={ex.after} />
          </>
        )}
      </p>
    </form>
  );
}
