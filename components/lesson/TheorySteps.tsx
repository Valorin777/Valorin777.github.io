"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { PlayButton, useSpeech } from "@/components/speech/SpeechProvider";
import { Button } from "@/components/ui/Button";
import { ArrowRightIcon } from "@/components/ui/Icons";
import { Kbd, KeyHints } from "@/components/ui/Kbd";
import { RichText } from "@/components/ui/RichText";
import type { RuleCard, RuleStep, Topic } from "@/lib/content/schema";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useAppState } from "@/lib/store";
import { StepFrame } from "./StepFrame";

const reveal = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.22, ease: [0.23, 1, 0.32, 1] as const },
};

function ExampleLine({ en, ru, id }: { en: string; ru?: string; id: string }) {
  const showRuSetting = useAppState().settings.showRu;
  const [showRu, setShowRu] = useState(false);
  const visibleRu = showRuSetting || showRu;
  return (
    <div className="flex items-start gap-2 rounded-md bg-surface-2/70 py-2 pr-3 pl-1">
      <PlayButton text={en} id={id} />
      <div className="min-w-0 flex-1 py-2.5">
        <p className="text-lesson text-text">
          <RichText text={en} />
        </p>
        {ru &&
          (visibleRu ? (
            <p lang="ru" className="mt-1 text-sm text-text-3">
              {ru}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setShowRu(true)}
              className="mt-1 -ml-1 rounded px-1 text-sm text-text-3 underline decoration-line-strong underline-offset-4 hover:text-text-2"
            >
              Перевод
            </button>
          ))}
      </div>
    </div>
  );
}

function RuleBlock({ step, id }: { step: RuleStep; id: string }) {
  switch (step.kind) {
    case "text":
      return (
        <p className="text-lesson text-text">
          <RichText text={step.text} />
        </p>
      );
    case "formula":
      return (
        <p className="flex flex-wrap items-center gap-2" aria-label={step.parts.join(" ")}>
          {step.parts.map((part, i) =>
            /^[+→=/|·]$/.test(part) ? (
              <span key={i} className="px-0.5 text-lg text-text-3" aria-hidden="true">
                {part}
              </span>
            ) : (
              <span
                key={i}
                aria-hidden="true"
                className="rounded-sm border border-line bg-surface px-3 py-1.5 font-medium text-text shadow-1"
              >
                <RichText text={part} />
              </span>
            ),
          )}
        </p>
      );
    case "table":
      return (
        <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[30rem] border-collapse text-left text-sm sm:min-w-0">
            <thead>
              <tr>
                {step.head.map((h, i) => (
                  <th key={i} scope="col" className="border-b border-line-strong py-2 pr-4 font-medium text-text-2">
                    <RichText text={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {step.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} className="border-b border-line py-2.5 pr-4 align-top text-text">
                      <RichText text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "example":
      return <ExampleLine en={step.en} ru={step.ru} id={id} />;
    case "signals":
      return (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_1fr]">
          {step.items.map((item, i) => (
            <div key={i} className="contents">
              <dt className="font-medium text-accent-text">{item.word}</dt>
              <dd className="-mt-2 text-text-2 sm:mt-0">
                <RichText text={item.use} />
              </dd>
            </div>
          ))}
        </dl>
      );
    case "tip":
      return (
        <div className="rounded-md border border-accent/20 bg-accent-soft px-4 py-3">
          <p className="text-xs font-medium tracking-[0.08em] text-accent-text uppercase">Tip</p>
          <p className="mt-1 text-base text-text">
            <RichText text={step.text} />
          </p>
        </div>
      );
  }
}

export function RuleStepView({
  topic,
  card,
  stepId,
  onNext,
  onBack,
}: {
  topic: Topic;
  card: RuleCard;
  stepId: string;
  onNext: () => void;
  onBack?: () => void;
}) {
  const [shown, setShown] = useState(1);
  const { speak } = useSpeech();
  const all = shown >= card.steps.length;
  const advance = () => (all ? onNext() : setShown((s) => s + 1));
  const lastExample = card.steps
    .slice(0, shown)
    .map((s, i) => ({ s, i }))
    .reverse()
    .find(({ s }) => s.kind === "example");

  useHotkeys({
    Enter: advance,
    ArrowRight: advance,
    ArrowLeft: () => onBack?.(),
    " ": () => {
      if (lastExample && lastExample.s.kind === "example") speak(lastExample.s.en, `${stepId}:${lastExample.i}`);
    },
  });

  return (
    <StepFrame
      eyebrow={topic.title}
      title={card.title}
      action={
        <Button full onClick={advance}>
          {all ? "Continue" : "Next point"}
          <ArrowRightIcon size={20} />
        </Button>
      }
      hints={
        <KeyHints>
          <Kbd>Enter</Kbd> next · <Kbd>Space</Kbd> listen · <Kbd>←</Kbd> back
        </KeyHints>
      }
    >
      <div className="grid gap-6">
        {card.steps.slice(0, shown).map((step, i) => (
          <motion.div key={i} {...(i === 0 ? {} : reveal)}>
            <RuleBlock step={step} id={`${stepId}:${i}`} />
          </motion.div>
        ))}
      </div>
      {!all && (
        <p className="mt-8 text-sm text-text-3" aria-live="polite">
          {shown} of {card.steps.length}
        </p>
      )}
    </StepFrame>
  );
}

export function MistakesStepView({
  topic,
  stepId,
  onNext,
  onBack,
}: {
  topic: Topic;
  stepId: string;
  onNext: () => void;
  onBack?: () => void;
}) {
  useHotkeys({ Enter: onNext, ArrowRight: onNext, ArrowLeft: () => onBack?.() });
  return (
    <StepFrame
      eyebrow={topic.title}
      title="Common mistake → natural English"
      action={
        <Button full onClick={onNext}>
          Continue
          <ArrowRightIcon size={20} />
        </Button>
      }
      hints={
        <KeyHints>
          <Kbd>Enter</Kbd> continue
        </KeyHints>
      }
    >
      <ul className="grid gap-4">
        {topic.mistakes.map((m, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: i * 0.04, ease: [0.23, 1, 0.32, 1] }}
            className="rounded-md border border-line bg-surface p-4 shadow-1"
          >
            <p className="text-base text-text-3">
              <span className="mr-2 text-xs font-medium tracking-[0.06em] text-warm uppercase">Not quite</span>
              <span className="line-through decoration-warm/70 decoration-1">
                <RichText text={m.wrong} />
              </span>
            </p>
            <div className="mt-1 flex items-center gap-1">
              <p className="flex-1 text-lesson text-text">
                <span className="mr-2 text-xs font-medium tracking-[0.06em] text-good uppercase">Better</span>
                <RichText text={m.right} />
              </p>
              <PlayButton text={m.right} id={`${stepId}:${i}`} className="-mr-2" />
            </div>
            <p className="mt-1 text-sm text-text-2">
              <RichText text={m.why} />
            </p>
          </motion.li>
        ))}
      </ul>
    </StepFrame>
  );
}

export function RuNoteStepView({
  topic,
  stepId,
  onNext,
  onBack,
}: {
  topic: Topic;
  stepId: string;
  onNext: () => void;
  onBack?: () => void;
}) {
  useHotkeys({ Enter: onNext, ArrowRight: onNext, ArrowLeft: () => onBack?.() });
  const ex = topic.ruNote.example;
  return (
    <StepFrame
      eyebrow={topic.title}
      title="Для русскоговорящих"
      titleLang="ru"
      action={
        <Button full onClick={onNext}>
          Continue
          <ArrowRightIcon size={20} />
        </Button>
      }
      hints={
        <KeyHints>
          <Kbd>Enter</Kbd> continue
        </KeyHints>
      }
    >
      <p lang="ru" className="text-lesson text-text">
        <RichText text={topic.ruNote.text} />
      </p>
      {ex && (
        <div className="mt-6 rounded-md border border-line bg-surface p-4 shadow-1">
          <p lang="ru" className="text-sm text-text-3">
            {ex.ru}
          </p>
          <div className="mt-1 flex items-center gap-1">
            <p className="flex-1 text-lesson text-text">
              <RichText text={ex.en} />
            </p>
            <PlayButton text={ex.en} id={`${stepId}:ex`} className="-mr-2" />
          </div>
        </div>
      )}
    </StepFrame>
  );
}
