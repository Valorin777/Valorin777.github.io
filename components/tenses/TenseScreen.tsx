"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { ExerciseStep } from "@/components/lesson/ExerciseStep";
import { StepFrame } from "@/components/lesson/StepFrame";
import { ExampleLine } from "@/components/lesson/TheorySteps";
import { PlayButton } from "@/components/speech/SpeechProvider";
import { Button } from "@/components/ui/Button";
import { ArrowLeftIcon, ArrowRightIcon, CloseIcon } from "@/components/ui/Icons";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { RichText } from "@/components/ui/RichText";
import { Skeleton } from "@/components/ui/Skeleton";
import { usePrefetchSpeech } from "@/hooks/useSpeech";
import { getTense, TENSES } from "@/content/tenses";
import { TENSE_GROUP_LABELS, type TenseRef } from "@/lib/content/schema";
import { useAppState, useHydrated } from "@/lib/store";
import { TENSE_DAY, tenseExercise, tenseProgress } from "@/lib/tenses";
import { Timeline } from "./Timeline";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 font-sans text-xs font-medium tracking-[0.08em] text-text-3 uppercase">{title}</h2>
      {children}
    </section>
  );
}

function FormRow({ label, parts, example, id }: { label: string; parts: string[]; example: string; id: string }) {
  const sign = label === "+" || label === "−" || label === "-" || label === "?";
  return (
    <div className="grid gap-2 border-b border-line py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-sm font-medium ${
            sign ? "bg-surface-3 text-text" : "bg-accent-soft text-accent-text"
          }`}
        >
          {label === "-" ? "−" : label}
        </span>
        {parts.map((p, i) => (
          <span key={i} className="rounded-sm border border-line bg-surface px-2.5 py-1 text-sm font-medium text-text shadow-1">
            <RichText text={p} />
          </span>
        ))}
      </div>
      <div className="-ml-1 flex items-center gap-1">
        <PlayButton text={example} id={id} />
        <p className="text-base text-text-2">
          <RichText text={example} />
        </p>
      </div>
    </div>
  );
}

function Reference({ t, onPractise }: { t: TenseRef; onPractise: () => void }) {
  const state = useAppState();
  const progress = tenseProgress(state, t);
  const index = TENSES.findIndex((x) => x.id === t.id);
  const next = TENSES[index + 1] ?? null;
  usePrefetchSpeech(
    [...t.forms.map((f) => f.example), ...t.uses.map((u) => u.example.en)].slice(0, 8),
    state.settings.neuralVoice,
  );

  return (
    <>
      <main className="mx-auto w-full max-w-[var(--container-reading)] px-5 pt-safe pb-48">
        <header className="flex h-16 items-center gap-2">
          <Link
            href="/tenses/"
            aria-label="All the tenses"
            className="press -ml-3 inline-flex size-12 items-center justify-center rounded-full text-text-2 hover:bg-surface-2 hover:text-text"
          >
            <ArrowLeftIcon />
          </Link>
          <span className="text-sm text-text-3">{TENSE_GROUP_LABELS[t.group].en}</span>
        </header>

        <h1 className="text-2xl text-text">{t.name}</h1>
        <p className="mt-1 text-base text-text-3" lang="ru">
          {t.ruName}
        </p>
        <p className="mt-4 text-lesson text-text">{t.short}</p>

        <div className="mt-6 rounded-lg border border-line bg-surface px-5 py-4 shadow-1" lang="ru">
          <p className="text-base text-text">
            <RichText text={t.idea} />
          </p>
        </div>

        {t.timeline && (
          <div className="mt-4">
            <Timeline marks={t.timeline.marks} caption={t.timeline.caption} />
          </div>
        )}

        <Section title="How to build it">
          <div className="rounded-lg border border-line bg-surface px-4 shadow-1">
            {t.forms.map((f, i) => (
              <FormRow key={i} label={f.label} parts={f.parts} example={f.example} id={`tense:${t.id}:form:${i}`} />
            ))}
          </div>
        </Section>

        <Section title="When to use it">
          <ol className="grid gap-6">
            {t.uses.map((u, i) => (
              <li key={i} className="grid gap-2">
                <p className="flex items-baseline gap-2">
                  <span className="tabular text-sm text-text-3">{i + 1}</span>
                  <span className="text-lesson font-medium text-text">{u.en}</span>
                </p>
                <p className="text-base text-text-2" lang="ru">
                  <RichText text={u.ru} />
                </p>
                <ExampleLine en={u.example.en} ru={u.example.ru} id={`tense:${t.id}:use:${i}`} />
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Signal words">
          <ul className="flex flex-wrap gap-2">
            {t.signals.map((s, i) => (
              <li key={i} className="rounded-md border border-line bg-surface px-3 py-2 shadow-1">
                <span className="text-base font-medium text-accent-text">{s.word}</span>
                {s.note && (
                  <span className="mt-0.5 block text-sm text-text-3" lang="ru">
                    {s.note}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Don't mix it up">
          <div className="grid gap-4">
            {t.versus.map((v, i) => {
              const other = getTense(v.tense);
              return (
                <div key={i} className="rounded-lg border border-line bg-surface px-4 py-4 shadow-1">
                  <p className="text-sm text-text-3">
                    {t.name} vs{" "}
                    {other ? (
                      <Link href={`/tenses/${other.id}/`} className="text-accent-text underline underline-offset-4">
                        {other.name}
                      </Link>
                    ) : (
                      v.tense
                    )}
                  </p>
                  <p className="mt-2 text-base text-text" lang="ru">
                    <RichText text={v.ru} />
                  </p>
                  <div className="mt-3 grid gap-2">
                    <ExampleLine en={v.a.en} ru={v.a.ru} id={`tense:${t.id}:vs:${i}:a`} />
                    <ExampleLine en={v.b.en} ru={v.b.ru} id={`tense:${t.id}:vs:${i}:b`} />
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Typical mistakes">
          <ul className="grid gap-3">
            {t.mistakes.map((m, i) => (
              <li key={i} className="rounded-md bg-surface-2/70 px-4 py-3">
                <p className="text-base text-text-3">
                  <span className="mr-2 text-warm" aria-label="Wrong">
                    ✗
                  </span>
                  <span className="line-through decoration-warm/60">{m.wrong}</span>
                </p>
                <p className="mt-1 text-lesson text-text">
                  <span className="mr-2 text-good" aria-label="Right">
                    ✓
                  </span>
                  <RichText text={m.right} />
                </p>
                <p className="mt-1 text-sm text-text-2" lang="ru">
                  <RichText text={m.why} />
                </p>
              </li>
            ))}
          </ul>
        </Section>

        <div className="mt-10 rounded-lg border border-accent/25 bg-accent-soft px-5 py-4" lang="ru">
          <p className="text-xs font-medium tracking-[0.08em] text-accent-text uppercase">Фишка</p>
          <p className="mt-1.5 text-lesson text-text">
            <RichText text={t.trick} />
          </p>
        </div>

        <Section title="Examples">
          <div className="grid gap-2">
            {t.examples.map((e, i) => (
              <ExampleLine key={i} en={e.en} ru={e.ru} id={`tense:${t.id}:ex:${i}`} />
            ))}
          </div>
        </Section>

        {next && (
          <Link
            href={`/tenses/${next.id}/`}
            className="press mt-12 flex items-center gap-3 rounded-md border border-line px-4 py-3 text-text hover:border-line-strong"
          >
            <span className="flex-1">
              <span className="block text-xs text-text-3">Next</span>
              <span className="block text-base">{next.name}</span>
            </span>
            <ArrowRightIcon size={18} className="text-text-3" />
          </Link>
        )}
      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-bg from-55% to-transparent pt-10">
        <div className="pointer-events-auto mx-auto grid w-full max-w-[var(--container-reading)] gap-2 px-5 pb-safe">
          <Button full onClick={onPractise}>
            Practise · {t.exercises.length} exercises
          </Button>
          <p className="text-center text-xs text-text-3">
            {progress.right > 0 ? `${progress.right} of ${progress.total} done right so far` : "Mistakes go to your cards and the daily drill"}
          </p>
        </div>
      </div>
    </>
  );
}

function Practice({ t, onClose }: { t: TenseRef; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [right, setRight] = useState(0);
  const [done, setDone] = useState(false);
  const total = t.exercises.length;
  const ex = t.exercises[index];
  const topic = { title: t.name, category: t.category };
  const position = TENSES.findIndex((x) => x.id === t.id);
  const next = TENSES[position + 1] ?? null;

  const advance = () => {
    if (index + 1 < total) setIndex(index + 1);
    else setDone(true);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 bg-bg/90 pt-safe backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-3 px-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the practice"
            className="press inline-flex size-12 items-center justify-center rounded-full text-text-2 hover:bg-surface-2 hover:text-text"
          >
            <CloseIcon />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium text-text-2">{t.name}</span>
              <span className="tabular text-text-3">
                {Math.min(index + (done ? 0 : 1), total)} of {total}
              </span>
            </div>
            <div className="mt-2">
              <ProgressBar value={(done ? total : index) / total} label="Practice progress" />
            </div>
          </div>
          <span className="w-3" />
        </div>
      </header>

      {!done && ex && (
        <motion.div
          key={ex.id}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
        >
          <ExerciseStep
            day={TENSE_DAY}
            topic={topic}
            ex={tenseExercise(t, ex)}
            stepId={`tense:${t.id}:practice:${ex.id}`}
            onResult={(ok) => ok && setRight((r) => r + 1)}
            onNext={advance}
          />
        </motion.div>
      )}

      {done && (
        <StepFrame
          eyebrow={t.name}
          title={right === total ? "All right. Clean run." : `${right} of ${total} right.`}
          action={
            <div className="grid gap-2">
              {next ? (
                <Link
                  href={`/tenses/${next.id}/`}
                  className="press inline-flex h-14 w-full items-center justify-center gap-2 rounded-md bg-accent px-6 text-base font-medium text-accent-ink shadow-2 hover:bg-accent-hover"
                >
                  Next: {next.name}
                  <ArrowRightIcon size={20} />
                </Link>
              ) : null}
              <Button full variant={next ? "secondary" : "primary"} onClick={onClose}>
                Back to the rule
              </Button>
            </div>
          }
        >
          <p className="text-lesson text-text-2" lang="ru">
            {right === total
              ? "Это время у тебя в руках. Загляни сюда снова через пару дней — проверить, что не забылось."
              : "Ошибки уже в твоих карточках и попадут в ежедневную тренировку. Перечитай фишку и типичные ошибки — и пройди ещё раз."}
          </p>
          {right < total && (
            <button
              type="button"
              onClick={() => {
                setIndex(0);
                setRight(0);
                setDone(false);
              }}
              className="press mt-6 -ml-2 min-h-11 rounded-sm px-2 text-sm text-text-2 underline decoration-line-strong underline-offset-4 hover:text-text"
            >
              Try again
            </button>
          )}
        </StepFrame>
      )}
    </div>
  );
}

export function TenseScreen({ id }: { id: string }) {
  const hydrated = useHydrated();
  const [mode, setMode] = useState<"read" | "practice">("read");
  const t = getTense(id);
  if (!t) return null;
  if (!hydrated) {
    return (
      <div className="mx-auto w-full max-w-[var(--container-reading)] px-5 pt-20" aria-busy="true">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="mt-6 h-40 rounded-lg" />
      </div>
    );
  }
  return mode === "read" ? (
    <Reference
      t={t}
      onPractise={() => {
        setMode("practice");
        window.scrollTo({ top: 0 });
      }}
    />
  ) : (
    <Practice
      t={t}
      onClose={() => {
        setMode("read");
        window.scrollTo({ top: 0 });
      }}
    />
  );
}
