"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { SpeakStep } from "@/components/lesson/SpeakStep";
import { StepFrame } from "@/components/lesson/StepFrame";
import { useSpeech } from "@/components/speech/SpeechProvider";
import { Button, LinkButton } from "@/components/ui/Button";
import { ArrowRightIcon, CloseIcon } from "@/components/ui/Icons";
import { Kbd, KeyHints } from "@/components/ui/Kbd";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { RichText } from "@/components/ui/RichText";
import { DAYS } from "@/content";
import { useHotkeys } from "@/hooks/useHotkeys";
import { CATEGORY_LABELS, type Category, type FinalDay } from "@/lib/content/schema";
import { today } from "@/lib/date";
import { drillSize } from "@/lib/drill";
import { gapKey, scoreFinalTest, weakestCategories } from "@/lib/finalTest";
import { topErrors } from "@/lib/progress";
import { actions, getState, useAppState } from "@/lib/store";
import type { FinalTestResult } from "@/types/state";
import { ChoiceClozeStep, OpenClozeStep, type ClozeAnswers } from "./Cloze";

const DRAFT_KEY = "b2sprint:final-draft";

type FinalStep =
  | { id: "intro"; kind: "intro" }
  | { id: "errors"; kind: "errors" }
  | { id: string; kind: "speak"; index: number }
  | { id: string; kind: "p1"; index: number }
  | { id: string; kind: "p2"; index: number }
  | { id: "report"; kind: "report" };

function buildFinalSteps(day: FinalDay): FinalStep[] {
  return [
    { id: "intro", kind: "intro" },
    { id: "errors", kind: "errors" },
    ...day.speak.map((s, index) => ({ id: `speak:${s.id}`, kind: "speak" as const, index })),
    ...day.part1.map((t, index) => ({ id: `p1:${t.id}`, kind: "p1" as const, index })),
    ...day.part2.map((t, index) => ({ id: `p2:${t.id}`, kind: "p2" as const, index })),
    { id: "report", kind: "report" },
  ];
}

/** Where each category is taught, for "revisit" links in the report. */
const CATEGORY_DAY: Record<Category, number> = {
  "be-verb": 1,
  "tense-choice": 1,
  perfect: 1,
  conditionals: 2,
  "verb-patterns": 3,
  "passive-reported": 4,
  modals: 4,
  collocations: 5,
  linking: 6,
  articles: 6,
  countable: 6,
};

function readDraft(): ClozeAnswers {
  try {
    const raw = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "{}") as unknown;
    return raw && typeof raw === "object" ? (raw as ClozeAnswers) : {};
  } catch {
    return {};
  }
}

export function FinalScreen({ day }: { day: FinalDay }) {
  const steps = useMemo(() => buildFinalSteps(day), [day]);
  const [index, setIndex] = useState(() => {
    const s = getState();
    if (s.days[7]?.completedAt && s.finalTest) return steps.length - 1;
    const pos = s.position?.day === 7 ? steps.findIndex((st) => st.id === s.position?.stepId) : -1;
    return pos >= 0 ? pos : 0;
  });
  const [answers, setAnswers] = useState<ClozeAnswers>(() => readDraft());
  const { stop } = useSpeech();
  const step = steps[index];

  useEffect(() => {
    actions.startDay(7);
  }, []);
  useEffect(() => {
    actions.setPosition(7, steps[index].id);
  }, [index, steps]);
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") actions.addSeconds(7, 15);
    }, 15000);
    return () => window.clearInterval(id);
  }, []);

  const setAnswer = (key: string, value: string | number) => {
    setAnswers((a) => {
      const next = { ...a, [key]: value };
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      } catch {
        // private mode: answers live for this tab
      }
      return next;
    });
  };

  const go = (to: number) => {
    stop();
    setIndex(Math.max(0, Math.min(steps.length - 1, to)));
    window.scrollTo({ top: 0 });
  };
  const next = () => {
    const following = steps[index + 1];
    actions.completeStep(7, step.id, following?.id ?? null);
    if (following?.kind === "report") {
      const result = scoreFinalTest(day, answers, new Date().toISOString());
      actions.setFinalTest(result);
      actions.completeStep(7, "report", null);
      actions.completeStep(7, "done", null);
    }
    if (following) go(index + 1);
  };

  const retake = () => {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
    setAnswers({});
    const firstTest = steps.findIndex((s) => s.kind === "p1");
    go(firstTest);
  };

  const testSteps = steps.filter((s) => s.kind === "p1" || s.kind === "p2");
  const progress = index / (steps.length - 1);
  const p1 = day.part1.length;
  const p2 = day.part2.length;

  let content: ReactNode = null;
  switch (step.kind) {
    case "intro":
      content = <Intro day={day} onNext={next} />;
      break;
    case "errors":
      content = <ErrorsStep onNext={next} />;
      break;
    case "speak":
      content = (
        <SpeakStep
          day={7}
          item={day.speak[step.index]}
          index={step.index}
          total={day.speak.length}
          stepId={step.id}
          onNext={next}
        />
      );
      break;
    case "p1":
      content = (
        <ChoiceClozeStep
          text={day.part1[step.index]}
          label={`Use of English · Part 1 · Text ${step.index + 1} of ${p1}`}
          answers={answers}
          onAnswer={setAnswer}
          onNext={next}
          nextLabel="Next text"
        />
      );
      break;
    case "p2":
      content = (
        <OpenClozeStep
          text={day.part2[step.index]}
          label={`Use of English · Part 2 · Text ${step.index + 1} of ${p2}`}
          answers={answers}
          onAnswer={setAnswer}
          onNext={next}
          nextLabel={step.index === p2 - 1 ? "Finish the test" : "Next text"}
        />
      );
      break;
    case "report":
      content = <Report day={day} answers={answers} onRetake={retake} />;
      break;
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 bg-bg/90 pt-safe backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-3 px-3 sm:px-5">
          <Link
            href="/"
            aria-label="Pause and go home. Progress is saved."
            className="press inline-flex size-12 items-center justify-center rounded-full text-text-2 hover:bg-surface-2 hover:text-text"
          >
            <CloseIcon />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate font-medium text-text-2">
                Day 7 · {step.kind === "p1" || step.kind === "p2" ? "Test" : step.kind === "report" ? "Results" : step.kind === "speak" ? "Speaking" : "Review"}
              </span>
              <span className="shrink-0 tabular text-text-3">
                {step.kind === "p1" || step.kind === "p2"
                  ? `${testSteps.findIndex((s) => s.id === step.id) + 1} of ${testSteps.length} texts`
                  : step.kind === "report"
                    ? "Done"
                    : ""}
              </span>
            </div>
            <div className="mt-2">
              <ProgressBar value={progress} label="Day 7 progress" />
            </div>
          </div>
          <span className="w-3" />
        </div>
      </header>
      <motion.main
        key={step.id}
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      >
        {content}
      </motion.main>
    </div>
  );
}

function Intro({ day, onNext }: { day: FinalDay; onNext: () => void }) {
  useHotkeys({ Enter: onNext });
  return (
    <StepFrame
      eyebrow="Day 7"
      title={day.title}
      action={
        <Button full onClick={onNext}>
          Begin
          <ArrowRightIcon size={20} />
        </Button>
      }
      hints={
        <KeyHints>
          <Kbd>Enter</Kbd> begin
        </KeyHints>
      }
    >
      <p className="text-lesson text-text-2">{day.intro}</p>
      <ol className="mt-8 grid gap-3">
        {[
          ["Your mistakes", "the ones you repeated this week"],
          ["Speaking", `${day.speak.length} short sentences from every day`],
          ["Use of English", "Part 1 multiple choice and Part 2 open cloze, B2 First style"],
          ["Results", "by topic, with what to revisit"],
        ].map(([t, d], i) => (
          <li key={t} className="flex gap-4 rounded-md border border-line bg-surface p-4 shadow-1">
            <span className="font-serif text-xl text-text-3 tabular">{i + 1}</span>
            <span>
              <span className="block text-base text-text">{t}</span>
              <span className="block text-sm text-text-2">{d}</span>
            </span>
          </li>
        ))}
      </ol>
    </StepFrame>
  );
}

function ErrorsStep({ onNext }: { onNext: () => void }) {
  const state = useAppState();
  const top = topErrors(state, 10);
  const drill = drillSize(state, DAYS, today());
  useHotkeys({ Enter: onNext });
  return (
    <StepFrame
      eyebrow="Your error log"
      title={top.length ? "What you repeated this week" : "A clean week"}
      action={
        <Button full onClick={onNext}>
          Continue
          <ArrowRightIcon size={20} />
        </Button>
      }
    >
      {top.length === 0 ? (
        <p className="text-lesson text-text-2">No repeated mistakes on record. Straight on to speaking.</p>
      ) : (
        <>
          <ul className="grid gap-3">
            {top.map((e) => (
              <li key={e.key} className="rounded-md border border-line bg-surface p-3 shadow-1">
                <p className="text-xs text-text-3">
                  {CATEGORY_LABELS[e.category]} · {e.count === 1 ? "once" : `${e.count} times`}
                </p>
                <p className="mt-1 text-sm text-text-3 line-through decoration-warm/70">{e.wrong || e.prompt}</p>
                <p className="text-base text-text">{e.right}</p>
              </li>
            ))}
          </ul>
          {drill > 0 && (
            <p className="mt-6 text-sm text-text-2">
              Want to fix them first?{" "}
              <Link href="/drill/" className="text-accent-text underline underline-offset-4">
                Run a {drill}-item drill
              </Link>{" "}
              — Day 7 waits right here.
            </p>
          )}
        </>
      )}
    </StepFrame>
  );
}

function Report({ day, answers, onRetake }: { day: FinalDay; answers: ClozeAnswers; onRetake: () => void }) {
  const state = useAppState();
  const result: FinalTestResult = state.finalTest ?? scoreFinalTest(day, answers, new Date().toISOString());
  const weakest = weakestCategories(result, 3);
  const cats = (Object.entries(result.byCategory) as [Category, { correct: number; total: number }][]).sort(
    (a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total,
  );
  const [showAll, setShowAll] = useState(false);

  const wrong = [
    ...day.part1.flatMap((t) =>
      t.gaps.map((g, i) => ({
        key: gapKey(t.id, i + 1),
        n: i + 1,
        title: t.title,
        right: g.options[g.answer],
        explain: g.explain,
        category: g.category,
      })),
    ),
    ...day.part2.flatMap((t) =>
      t.gaps.map((g, i) => ({
        key: gapKey(t.id, i + 1),
        n: i + 1,
        title: t.title,
        right: g.answers[0],
        explain: g.explain,
        category: g.category,
      })),
    ),
  ].filter((w) => !result.answers[w.key]?.correct);

  return (
    <StepFrame
      eyebrow="Your results"
      title={result.band === "B2 ready" ? "You are B2 ready." : `${result.band}.`}
      action={
        <LinkButton href="/" full>
          Back home
          <ArrowRightIcon size={20} />
        </LinkButton>
      }
    >
      <div className="flex items-end gap-6">
        <p className="font-serif text-[3.5rem] leading-none text-text tabular">{result.percent}%</p>
        <dl className="grid gap-1 pb-1 text-sm text-text-2">
          <div>
            <dt className="inline">Part 1 </dt>
            <dd className="inline tabular">
              {result.part1.correct}/{result.part1.total}
            </dd>
          </div>
          <div>
            <dt className="inline">Part 2 </dt>
            <dd className="inline tabular">
              {result.part2.correct}/{result.part2.total}
            </dd>
          </div>
        </dl>
      </div>
      <p className="mt-4 text-base text-text-2">
        B2 First passes at roughly 60%. This is a short practice test, so treat it as a direction, not a grade.
      </p>

      <h2 className="mt-10 font-sans text-xs font-medium tracking-[0.08em] text-text-3 uppercase">By topic</h2>
      <ul className="mt-4 grid gap-4">
        {cats.map(([c, s], i) => (
          <li key={c}>
            <div className="flex items-baseline justify-between gap-4 text-sm">
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
                transition={{ duration: 0.4, delay: 0.1 + i * 0.03, ease: [0.23, 1, 0.32, 1] }}
              />
            </div>
          </li>
        ))}
      </ul>

      {weakest.length > 0 && (
        <>
          <h2 className="mt-10 font-sans text-xs font-medium tracking-[0.08em] text-text-3 uppercase">Revisit next</h2>
          <ul className="mt-3 grid gap-2">
            {weakest.map((c) => (
              <li key={c}>
                <Link
                  href={`/day/${CATEGORY_DAY[c]}/`}
                  className="press -mx-2 flex min-h-12 items-center justify-between rounded-md px-2 text-base text-text hover:bg-surface-2"
                >
                  <span>{CATEGORY_LABELS[c]}</span>
                  <span className="text-sm text-text-3">Day {CATEGORY_DAY[c]} →</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {wrong.length > 0 && (
        <>
          <h2 className="mt-10 font-sans text-xs font-medium tracking-[0.08em] text-text-3 uppercase">
            The gaps you missed · {wrong.length}
          </h2>
          <ul className="mt-3 grid gap-3">
            {(showAll ? wrong : wrong.slice(0, 5)).map((w) => (
              <li key={w.key} className="rounded-md border border-line bg-surface p-3 shadow-1">
                <p className="text-xs text-text-3">
                  {w.title} · gap {w.n} · {CATEGORY_LABELS[w.category]}
                </p>
                <p className="mt-1 text-sm text-text-3">
                  You: <span className="line-through decoration-warm/70">{result.answers[w.key]?.given || "—"}</span>
                </p>
                <p className="text-base text-text">{w.right}</p>
                <p className="mt-1 text-sm text-text-2">
                  <RichText text={w.explain} />
                </p>
              </li>
            ))}
          </ul>
          {wrong.length > 5 && !showAll && (
            <Button variant="quiet" size="md" className="mt-2 -ml-3" onClick={() => setShowAll(true)}>
              Show all {wrong.length}
            </Button>
          )}
        </>
      )}

      <div className="mt-8">
        <Button variant="quiet" size="md" onClick={onRetake} className="-ml-3">
          Take the test again
        </Button>
      </div>
    </StepFrame>
  );
}
