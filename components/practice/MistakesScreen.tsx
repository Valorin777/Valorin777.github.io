"use client";

import Link from "next/link";
import { useMemo } from "react";
import { PlayButton } from "@/components/speech/SpeechProvider";
import { LinkButton } from "@/components/ui/Button";
import { ArrowLeftIcon, ArrowRightIcon } from "@/components/ui/Icons";
import { RichText } from "@/components/ui/RichText";
import { Skeleton } from "@/components/ui/Skeleton";
import { DAYS } from "@/content";
import { CATEGORY_LABELS, type Category } from "@/lib/content/schema";
import { today } from "@/lib/date";
import { drillSize } from "@/lib/drill";
import { topErrors } from "@/lib/progress";
import { useAppState, useHydrated } from "@/lib/store";

export function MistakesScreen() {
  const hydrated = useHydrated();
  const state = useAppState();
  const top = useMemo(() => topErrors(state, 10), [state]);
  const byCategory = useMemo(() => {
    const counts = new Map<Category, number>();
    for (const e of Object.values(state.errors)) counts.set(e.category, (counts.get(e.category) ?? 0) + e.count);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [state]);
  const drill = hydrated ? drillSize(state, DAYS, today()) : 0;

  return (
    <main className="mx-auto w-full max-w-[var(--container-reading)] px-5 pt-safe pb-40">
      <header className="flex h-16 items-center gap-2">
        <Link
          href="/"
          aria-label="Back home"
          className="press -ml-3 inline-flex size-12 items-center justify-center rounded-full text-text-2 hover:bg-surface-2 hover:text-text"
        >
          <ArrowLeftIcon />
        </Link>
        <h1 className="text-lg text-text">Top mistakes</h1>
      </header>

      {!hydrated ? (
        <Skeleton className="mt-6 h-64 rounded-lg" />
      ) : top.length === 0 ? (
        <div className="pt-10">
          <p className="font-serif text-2xl text-text">No mistakes yet.</p>
          <p className="mt-3 text-base text-text-2">
            Every slip lands here with its fix, and the ones you repeat rise to the top. Then one tap turns them into a
            short drill.
          </p>
          <div className="mt-10">
            <LinkButton href="/" full variant="secondary">
              Back home
            </LinkButton>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-2 text-base text-text-2">The ones you repeat most. Practise them for a few minutes a day.</p>
          {byCategory.length > 1 && (
            <ul className="mt-5 flex flex-wrap gap-2" aria-label="Mistakes by topic">
              {byCategory.map(([c, n]) => (
                <li key={c} className="rounded-full border border-line bg-surface px-3 py-1 text-sm text-text-2">
                  {CATEGORY_LABELS[c]} <span className="tabular text-text-3">· {n}</span>
                </li>
              ))}
            </ul>
          )}
          <ol className="mt-6 grid gap-3">
            {top.map((e, i) => (
              <li key={e.key} className="rounded-md border border-line bg-surface p-4 shadow-1">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-medium tracking-[0.06em] text-text-3 uppercase">
                    {i + 1}. {CATEGORY_LABELS[e.category]}
                  </span>
                  <span className="tabular text-text-3">{e.count === 1 ? "once" : `${e.count} times`}</span>
                </div>
                <p className="mt-2 text-base text-text">
                  <RichText text={e.prompt} />
                </p>
                {e.wrong && (
                  <p className="mt-1 text-sm text-text-3">
                    <span className="mr-1.5 text-xs font-medium tracking-[0.06em] text-warm uppercase">You</span>
                    <span className="line-through decoration-warm/70">{e.wrong}</span>
                  </p>
                )}
                <div className="mt-1 flex items-center gap-1">
                  <p className="flex-1 text-base text-text">
                    <span className="mr-1.5 text-xs font-medium tracking-[0.06em] text-good uppercase">Right</span>
                    {e.right}
                  </p>
                  <PlayButton text={e.right} id={`err:${e.key}`} className="-my-2 -mr-2" />
                </div>
                <p className="mt-1 text-sm text-text-2">
                  <RichText text={e.rule} />
                </p>
              </li>
            ))}
          </ol>
        </>
      )}

      {hydrated && drill > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-bg from-60% to-transparent pt-10">
          <div className="mx-auto w-full max-w-[var(--container-reading)] px-5 pb-safe">
            <LinkButton href="/drill/" full>
              Practise them · {drill}
              <ArrowRightIcon size={20} />
            </LinkButton>
          </div>
        </div>
      )}
    </main>
  );
}
