"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GapSentence } from "@/components/exercises/ChoiceView";
import { StepFrame } from "@/components/lesson/StepFrame";
import { Button, LinkButton } from "@/components/ui/Button";
import { ArrowRightIcon } from "@/components/ui/Icons";
import { Kbd, KeyHints } from "@/components/ui/Kbd";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Skeleton } from "@/components/ui/Skeleton";
import { getDiagnostic } from "@/content";
import { useHotkeys } from "@/hooks/useHotkeys";
import { CATEGORY_LABELS } from "@/lib/content/schema";
import { scoreDiagnostic, skippedDiagnostic } from "@/lib/diagnostic";
import { actions, useAppState, useHydrated } from "@/lib/store";
import type { DiagnosticResult } from "@/types/state";

const LEVEL_TEXT: Record<string, string> = {
  "B1-": "a solid start, around B1",
  B1: "around B1",
  "B1+": "a confident B1+",
  B2: "already close to B2",
};

/** First-visit check: ten taps, about a minute, decides which drills come first. Skippable. */
export function DiagnosticScreen() {
  const hydrated = useHydrated();
  const state = useAppState();
  const [retake, setRetake] = useState(false);
  if (!hydrated) {
    return (
      <div className="mx-auto w-full max-w-[var(--container-reading)] px-5 pt-20" aria-busy="true">
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }
  if (state.diagnostic?.level && !retake) return <Result result={state.diagnostic} onRetake={() => setRetake(true)} />;
  return <Quiz />;
}

function Quiz() {
  const router = useRouter();
  const items = getDiagnostic();
  const [i, setI] = useState(0);
  const [picks, setPicks] = useState<Record<string, number | null>>({});
  const [picked, setPicked] = useState<number | null>(null);
  const item = items[i];

  const skip = () => {
    actions.setDiagnostic(skippedDiagnostic(new Date().toISOString()));
    router.push("/day/1/");
  };

  const choose = (n: number) => {
    if (!item || picked !== null || n >= item.options.length) return;
    setPicked(n);
    const next = { ...picks, [item.id]: n };
    setPicks(next);
    window.setTimeout(() => {
      setPicked(null);
      if (i + 1 < items.length) setI(i + 1);
      else actions.setDiagnostic(scoreDiagnostic(items, next, new Date().toISOString()));
    }, 320);
  };

  useHotkeys({ "1": () => choose(0), "2": () => choose(1), "3": () => choose(2), "4": () => choose(3) });

  if (!item) {
    return (
      <StepFrame title="The quick check is not ready yet." action={<LinkButton href="/day/1/" full>Start Day 1</LinkButton>}>
        <p className="text-base text-text-2">You can start the course right away.</p>
      </StepFrame>
    );
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 bg-bg/90 pt-safe backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[var(--container-reading)] items-center gap-4 px-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium text-text-2">Quick check</span>
              <span className="tabular text-text-3">
                {i + 1} of {items.length}
              </span>
            </div>
            <div className="mt-2">
              <ProgressBar value={i / items.length} label="Quick check progress" />
            </div>
          </div>
          <button
            type="button"
            onClick={skip}
            className="press -mr-2 min-h-11 rounded-sm px-2 text-sm text-text-2 hover:text-text"
          >
            Skip
          </button>
        </div>
      </header>

      <motion.div
        key={item.id}
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      >
        <StepFrame
          eyebrow={i === 0 ? "Ten taps · about a minute" : CATEGORY_LABELS[item.category]}
          title={i === 0 ? "What fits best?" : undefined}
          action={<p className="flex h-14 items-center justify-center text-sm text-text-3">Tap the answer you would say</p>}
          hints={
            <KeyHints>
              <Kbd>1</Kbd>–<Kbd>{item.options.length}</Kbd> choose
            </KeyHints>
          }
        >
          {i === 0 && (
            <p className="-mt-2 mb-6 text-base text-text-2">
              No pressure and no score to keep: it only decides what we practise first.
            </p>
          )}
          <GapSentence prompt={item.prompt} />
          <div className="mt-8 grid gap-3" role="group" aria-label="Options">
            {item.options.map((opt, n) => (
              <button
                key={n}
                type="button"
                onClick={() => choose(n)}
                className={`press flex min-h-14 w-full items-center gap-4 rounded-md border px-4 py-3 text-left shadow-1 ${
                  picked === n ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong hover:bg-surface-2"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-line text-xs tabular text-text-3"
                >
                  {n + 1}
                </span>
                <span className="text-base text-text sm:text-lg">{opt}</span>
              </button>
            ))}
          </div>
        </StepFrame>
      </motion.div>
    </div>
  );
}

function Result({ result, onRetake }: { result: DiagnosticResult; onRetake: () => void }) {
  const state = useAppState();
  const started = Object.keys(state.days).length > 0;
  const focus = result.focus.slice(0, 2).map((c) => CATEGORY_LABELS[c]);
  const rows = Object.entries(result.byCategory) as [keyof typeof CATEGORY_LABELS, { correct: number; total: number }][];
  return (
    <div className="min-h-dvh">
      <div className="mx-auto flex h-14 w-full max-w-[var(--container-reading)] items-center px-5 pt-safe">
        <Link href="/" className="press -ml-2 min-h-11 rounded-sm px-2 pt-3 text-sm text-text-2 hover:text-text">
          Home
        </Link>
      </div>
      <StepFrame
        eyebrow="Your starting point"
        title={`You are ${result.level ? LEVEL_TEXT[result.level] : "ready to start"}.`}
        action={
          <LinkButton href="/day/1/" full>
            {started ? "Continue the course" : "Start Day 1"}
            <ArrowRightIcon size={20} />
          </LinkButton>
        }
      >
        <p className="text-lesson text-text-2">
          {focus.length ? `Your daily drills will start with ${focus.join(" and ")}.` : "Your daily drills follow your mistakes."}
        </p>
        <ul className="mt-8 grid gap-4">
          {rows.map(([c, s], idx) => (
            <li key={c}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-text">{CATEGORY_LABELS[c]}</span>
                <span className="tabular text-text-2">
                  {s.correct} of {s.total}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                <motion.div
                  className="h-full w-full origin-left rounded-full bg-accent"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: s.total ? s.correct / s.total : 0 }}
                  transition={{ duration: 0.4, delay: 0.1 + idx * 0.04, ease: [0.23, 1, 0.32, 1] }}
                />
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-8">
          <Button variant="quiet" size="md" onClick={onRetake} className="-ml-3">
            Take the check again
          </Button>
        </div>
      </StepFrame>
    </div>
  );
}
