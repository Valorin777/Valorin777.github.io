"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { StepFrame } from "@/components/lesson/StepFrame";
import { Button } from "@/components/ui/Button";
import { ArrowRightIcon } from "@/components/ui/Icons";
import { Kbd, KeyHints } from "@/components/ui/Kbd";
import { useHotkeys } from "@/hooks/useHotkeys";
import type { ChoiceCloze, OpenCloze } from "@/lib/content/schema";
import { gapKey } from "@/lib/finalTest";

export type ClozeAnswers = Record<string, string | number | null>;

const LETTERS = ["A", "B", "C", "D"];

/** The text with numbered gaps as tappable chips; the active gap is outlined. */
function ClozeText({
  text,
  render,
}: {
  text: string;
  render: (n: number) => ReactNode;
}) {
  const parts = text.split(/(\{\{\d+\}\})/g);
  return (
    <div className="text-lesson leading-[2.4rem] text-text">
      {parts.map((p, i) => {
        const m = /^\{\{(\d+)\}\}$/.exec(p);
        if (!m) {
          return p.split(/\n{2,}/).map((para, j, arr) => (
            <span key={`${i}-${j}`}>
              {para}
              {j < arr.length - 1 && <span className="block h-4" />}
            </span>
          ));
        }
        return <span key={i}>{render(Number(m[1]))}</span>;
      })}
    </div>
  );
}

function GapChip({ n, value, active, onClick }: { n: number; value: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Gap ${n}${value ? `: ${value}` : ", empty"}`}
      aria-current={active ? "true" : undefined}
      className={`press mx-0.5 inline-flex min-h-10 min-w-[4.5rem] items-center justify-center gap-1.5 rounded-sm border px-2 align-baseline text-base leading-none ${
        active
          ? "border-accent bg-accent-soft text-text ring-2 ring-accent/25"
          : value
            ? "border-line bg-surface-2 text-text"
            : "border-dashed border-line-strong text-text-3"
      }`}
    >
      <span className="text-xs tabular text-text-3">{n}</span>
      <span className={value ? "font-medium" : ""}>{value || "…"}</span>
    </button>
  );
}

function firstEmpty(count: number, filled: (n: number) => boolean, from = 1): number | null {
  for (let k = 0; k < count; k++) {
    const n = ((from - 1 + k) % count) + 1;
    if (!filled(n)) return n;
  }
  return null;
}

/** Use of English Part 1: tap a gap, pick A–D. Picking moves to the next empty gap. */
export function ChoiceClozeStep({
  text,
  label,
  answers,
  onAnswer,
  onNext,
  nextLabel,
}: {
  text: ChoiceCloze;
  label: string;
  answers: ClozeAnswers;
  onAnswer: (key: string, value: number) => void;
  onNext: () => void;
  nextLabel: string;
}) {
  const count = text.gaps.length;
  const value = (n: number) => answers[gapKey(text.id, n)];
  const filled = (n: number) => typeof value(n) === "number";
  const [active, setActive] = useState<number>(() => firstEmpty(count, filled) ?? 1);
  const allFilled = firstEmpty(count, filled) === null;
  const gap = text.gaps[active - 1];

  const pick = (o: number) => {
    if (!gap || o > 3) return;
    onAnswer(gapKey(text.id, active), o);
    const next = firstEmpty(count, (n) => n === active || filled(n), active + 1);
    if (next) setActive(next);
  };

  useHotkeys({
    "1": () => pick(0),
    "2": () => pick(1),
    "3": () => pick(2),
    "4": () => pick(3),
    a: () => pick(0),
    b: () => pick(1),
    c: () => pick(2),
    d: () => pick(3),
    ArrowRight: () => setActive((a) => Math.min(count, a + 1)),
    ArrowLeft: () => setActive((a) => Math.max(1, a - 1)),
    Enter: () => allFilled && onNext(),
  });

  return (
    <StepFrame
      eyebrow={label}
      title={text.title}
      action={
        <div className="grid gap-3">
          <p className="text-center text-xs text-text-3" aria-live="polite">
            Gap {active} of {count}
          </p>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label={`Options for gap ${active}`}>
            {gap?.options.map((o, i) => {
              const chosen = value(active) === i;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(i)}
                  className={`press flex min-h-12 items-center gap-2 rounded-md border px-3 text-left text-base shadow-1 ${
                    chosen ? "border-accent bg-accent-soft text-text" : "border-line bg-surface text-text hover:border-line-strong"
                  }`}
                >
                  <span className="text-xs tabular text-text-3">{LETTERS[i]}</span>
                  {o}
                </button>
              );
            })}
          </div>
          {allFilled && (
            <Button full onClick={onNext}>
              {nextLabel}
              <ArrowRightIcon size={20} />
            </Button>
          )}
        </div>
      }
      hints={
        <KeyHints>
          <Kbd>A</Kbd>–<Kbd>D</Kbd> choose · <Kbd>←</Kbd>
          <Kbd>→</Kbd> gap {allFilled ? <>· <Kbd>Enter</Kbd> next</> : null}
        </KeyHints>
      }
    >
      <p className="-mt-2 mb-5 text-sm text-text-3">Choose the word that best fits each gap.</p>
      <div className="pb-24">
        <ClozeText
          text={text.text}
          render={(n) => {
            const v = value(n);
            return (
              <GapChip
                n={n}
                value={typeof v === "number" ? text.gaps[n - 1].options[v] : ""}
                active={n === active}
                onClick={() => setActive(n)}
              />
            );
          }}
        />
      </div>
    </StepFrame>
  );
}

/** Use of English Part 2: tap a gap, type one word, Enter moves on. */
export function OpenClozeStep({
  text,
  label,
  answers,
  onAnswer,
  onNext,
  nextLabel,
}: {
  text: OpenCloze;
  label: string;
  answers: ClozeAnswers;
  onAnswer: (key: string, value: string) => void;
  onNext: () => void;
  nextLabel: string;
}) {
  const count = text.gaps.length;
  const value = (n: number) => {
    const v = answers[gapKey(text.id, n)];
    return typeof v === "string" ? v : "";
  };
  const filled = (n: number) => value(n).trim().length > 0;
  const [active, setActive] = useState<number>(() => firstEmpty(count, filled) ?? 1);
  const [draft, setDraft] = useState(() => value(active));
  const input = useRef<HTMLInputElement>(null);
  const allFilled = firstEmpty(count, filled) === null;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the field shows the active gap's answer
    setDraft(value(active));
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) input.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the active gap changes
  }, [active]);

  const commit = () => {
    const word = draft.trim().split(/\s+/)[0] ?? "";
    onAnswer(gapKey(text.id, active), word);
    const next = firstEmpty(count, (n) => (n === active ? word.length > 0 : filled(n)), active + 1);
    if (next && next !== active) setActive(next);
    else if (word && allFilledAfter(word)) input.current?.blur();
  };
  const allFilledAfter = (word: string) => firstEmpty(count, (n) => (n === active ? word.length > 0 : filled(n))) === null;

  useHotkeys({
    ArrowRight: () => setActive((a) => Math.min(count, a + 1)),
    ArrowLeft: () => setActive((a) => Math.max(1, a - 1)),
    Enter: () => allFilled && onNext(),
  });

  return (
    <StepFrame
      eyebrow={label}
      title={text.title}
      action={
        <div className="grid gap-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              commit();
            }}
          >
            <label htmlFor={`gap-${text.id}`} className="sr-only">
              Word for gap {active}
            </label>
            <span className="inline-flex h-12 items-center text-sm tabular text-text-3">{active}</span>
            <input
              ref={input}
              id={`gap-${text.id}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/\s/g, ""))}
              onBlur={() => draft.trim() !== value(active) && onAnswer(gapKey(text.id, active), draft.trim())}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              placeholder="one word"
              className="h-12 min-w-0 flex-1 rounded-md border-2 border-line-strong bg-surface px-3 text-lg text-text outline-none focus:border-accent"
            />
            <Button type="submit" size="md" variant="secondary" disabled={!draft.trim()}>
              OK
            </Button>
          </form>
          {allFilled && (
            <Button full onClick={onNext}>
              {nextLabel}
              <ArrowRightIcon size={20} />
            </Button>
          )}
        </div>
      }
      hints={
        <KeyHints>
          <Kbd>Enter</Kbd> next gap · <Kbd>←</Kbd>
          <Kbd>→</Kbd> move
        </KeyHints>
      }
    >
      <p className="-mt-2 mb-5 text-sm text-text-3">Write one word in each gap.</p>
      <div className="pb-24">
        <ClozeText
          text={text.text}
          render={(n) => (
            <GapChip n={n} value={n === active ? draft : value(n)} active={n === active} onClick={() => setActive(n)} />
          )}
        />
      </div>
    </StepFrame>
  );
}
