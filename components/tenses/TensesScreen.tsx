"use client";

import Link from "next/link";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, ChevronRightIcon } from "@/components/ui/Icons";
import { getTense, TENSE_MAP, tensesIn } from "@/content/tenses";
import type { TenseRef } from "@/lib/content/schema";
import { useAppState, useHydrated } from "@/lib/store";
import { tenseProgress } from "@/lib/tenses";

const COLUMNS = ["Past", "Present", "Future"] as const;

function Progress({ t }: { t: TenseRef }) {
  const state = useAppState();
  const hydrated = useHydrated();
  if (!hydrated) return null;
  const { right, total } = tenseProgress(state, t);
  if (right === 0) return null;
  if (right >= total)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-good" aria-label="Practised">
        <CheckIcon size={14} />
      </span>
    );
  return (
    <span className="text-xs tabular text-text-3" aria-label={`${right} of ${total} practised`}>
      {right}/{total}
    </span>
  );
}

function Row({ t }: { t: TenseRef }) {
  return (
    <Link
      href={`/tenses/${t.id}/`}
      className="press -mx-2 flex min-h-16 items-center gap-3 rounded-md px-2 py-2.5 text-text hover:bg-surface-2"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-base text-text">{t.name}</span>
        <span className="block text-sm text-text-3">{t.ruName}</span>
      </span>
      <Progress t={t} />
      <ChevronRightIcon size={18} className="shrink-0 text-text-3" />
    </Link>
  );
}

export function TensesScreen() {
  const be = getTense("be-rule");
  const key = tensesIn("key").filter((t) => t.id !== "be-rule");
  const extraFuture = tensesIn("future").filter((t) => !TENSE_MAP.some((r) => r.cells.includes(t.id)));

  return (
    <main className="mx-auto w-full max-w-3xl px-5 pt-safe pb-24 sm:px-8">
      <header className="flex h-16 items-center gap-2">
        <Link
          href="/"
          aria-label="Back home"
          className="press -ml-3 inline-flex size-12 items-center justify-center rounded-full text-text-2 hover:bg-surface-2 hover:text-text"
        >
          <ArrowLeftIcon />
        </Link>
      </header>

      <h1 className="text-2xl text-text">All the tenses</h1>
      <p className="mt-3 max-w-[34rem] text-lesson text-text-2" lang="ru">
        Каждое время — на линии времени, с формулой, примерами, типичными ошибками и тренировкой. Открой любое, когда
        сомневаешься.
      </p>

      {be && (
        <Link
          href={`/tenses/${be.id}/`}
          className="press mt-8 flex items-center gap-4 rounded-lg border border-accent/25 bg-accent-soft px-5 py-4 shadow-1"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium tracking-[0.08em] text-accent-text uppercase">Start here</span>
            <span className="mt-1 block font-serif text-xl text-text">{be.name}</span>
            <span className="mt-1 block text-sm text-text-2" lang="ru">
              {be.ruName}
            </span>
          </span>
          <Progress t={be} />
          <ArrowRightIcon size={20} className="shrink-0 text-accent-text" />
        </Link>
      )}

      <section aria-labelledby="map" className="mt-12">
        <h2 id="map" className="font-sans text-xs font-medium tracking-[0.08em] text-text-3 uppercase">
          The tense map
        </h2>
        <p className="mt-2 text-sm text-text-3" lang="ru">
          12 времён — это 3 момента (прошлое, настоящее, будущее) × 4 взгляда на действие.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-medium tracking-[0.06em] text-text-3 uppercase" aria-hidden="true">
          {COLUMNS.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <div className="mt-2 grid gap-4">
          {TENSE_MAP.map((row) => (
            <div key={row.aspect}>
              <h3 className="mb-1.5 font-sans text-sm font-medium text-text-2">{row.aspect}</h3>
              <ul className="grid grid-cols-3 gap-2">
                {row.cells.map((id, i) => {
                  const t = getTense(id);
                  if (!t) return <li key={id} />;
                  return (
                    <li key={id}>
                      <Link
                        href={`/tenses/${id}/`}
                        aria-label={`${t.name}: ${row.forms[i]}`}
                        className="press flex h-full min-h-16 flex-col justify-between gap-1 rounded-md border border-line bg-surface px-2.5 py-2 text-left shadow-1 hover:border-line-strong sm:px-3"
                      >
                        <span className="text-sm leading-5 text-text sm:text-base">{row.forms[i]}</span>
                        <span className="flex items-center justify-between gap-1">
                          <span className="truncate text-xs text-text-3">{COLUMNS[i]}</span>
                          <Progress t={t} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        {extraFuture.length > 0 && (
          <div className="mt-6 grid gap-1">
            <h3 className="mb-1 font-sans text-sm font-medium text-text-2">More ways to talk about the future</h3>
            {extraFuture.map((t) => (
              <Row key={t.id} t={t} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="rules" className="mt-12">
        <h2 id="rules" className="mb-2 font-sans text-xs font-medium tracking-[0.08em] text-text-3 uppercase">
          Key rules
        </h2>
        <div className="grid gap-1">
          {key.map((t) => (
            <Row key={t.id} t={t} />
          ))}
        </div>
      </section>
    </main>
  );
}
