"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useMemo } from "react";
import { getDay, listDays } from "@/content";
import { LinkButton } from "@/components/ui/Button";
import {
  ArrowRightIcon,
  CardsIcon,
  ChatIcon,
  CheckIcon,
  ChevronRightIcon,
  FlameIcon,
  LockIcon,
  SettingsIcon,
} from "@/components/ui/Icons";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Skeleton } from "@/components/ui/Skeleton";
import { today } from "@/lib/date";
import { dueCount, getDayProgress, isDayUnlocked } from "@/lib/progress";
import {
  buildSteps,
  formatMinutes,
  progressRatio,
  remainingSeconds,
  sectionBounds,
  SECTION_LABELS,
  type Section,
} from "@/lib/steps";
import { storageAvailable, useAppState, useHydrated } from "@/lib/store";
import type { AppState } from "@/types/state";

function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** The day "Continue" should open: where the learner stopped, else the first unfinished open day. */
export function currentDayNumber(s: AppState): number {
  const metas = listDays();
  if (s.position) {
    const meta = metas.find((m) => m.number === s.position?.day);
    if (meta?.available && !getDayProgress(s, meta.number).completedAt) return meta.number;
  }
  const open = metas.find((m) => m.available && isDayUnlocked(s, m.number) && !getDayProgress(s, m.number).completedAt);
  if (open) return open.number;
  const lastDone = [...metas].reverse().find((m) => getDayProgress(s, m.number).completedAt);
  return lastDone?.number ?? 1;
}

const SECTIONS: Section[] = ["learn", "speak", "review"];

export function HomeScreen() {
  const hydrated = useHydrated();
  const state = useAppState();

  const view = useMemo(() => {
    const n = currentDayNumber(state);
    const day = getDay(n);
    const meta = listDays().find((m) => m.number === n);
    const progress = getDayProgress(state, n);
    const steps = day ? buildSteps(day) : [];
    const bounds = day ? sectionBounds(steps) : null;
    const ratio = day ? progressRatio(steps, progress.doneSteps) : 0;
    const left = day ? remainingSeconds(steps, progress.doneSteps) : 0;
    const done = new Set(progress.doneSteps);
    const sectionDone = (sec: Section) =>
      bounds ? steps.slice(bounds[sec].start, bounds[sec].end).every((st) => done.has(st.id)) : false;
    const sectionMinutes = (sec: Section) => (bounds ? Math.max(1, Math.round(bounds[sec].seconds / 60)) : 0);
    return {
      n,
      day,
      meta,
      progress,
      ratio,
      left,
      started: progress.doneSteps.length > 0,
      completed: Boolean(progress.completedAt),
      sectionDone,
      sectionMinutes,
      due: dueCount(state, today()),
    };
  }, [state]);

  if (!hydrated) return <HomeSkeleton />;

  const { n, meta, ratio, left, started, completed, due } = view;
  const primary = completed
    ? due > 0
      ? { href: "/review/", label: `Review ${due} card${due === 1 ? "" : "s"}` }
      : { href: "/coach/", label: "Talk with the coach" }
    : { href: `/day/${n}/`, label: started ? "Continue" : `Start Day ${n}` };

  return (
    <main className="mx-auto w-full max-w-5xl px-5 pt-safe pb-36 sm:px-8 md:pb-16">
      <header className="flex h-16 items-center justify-between">
        <span className="font-serif text-lg tracking-tight text-text">B2 Sprint</span>
        <Link
          href="/settings/"
          aria-label="Settings"
          className="press -mr-2 inline-flex size-12 items-center justify-center rounded-full text-text-2 hover:bg-surface-2 hover:text-text"
        >
          <SettingsIcon />
        </Link>
      </header>

      <div className="mt-6 grid gap-10 md:mt-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
        <section aria-labelledby="today-title">
          <p className="text-sm text-text-3">{greeting(new Date())}.</p>
          <h1 id="today-title" className="mt-1 text-2xl text-text">
            {completed ? "Day " + n + " is done." : started ? "Pick up where you left off." : "Your first day starts here."}
          </h1>
          {state.streak.current > 0 && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-text-2">
              <FlameIcon size={18} className="text-warm" />
              <span>
                {state.streak.current}-day streak
              </span>
            </p>
          )}

          <motion.article
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="mt-8 rounded-lg border border-line bg-surface p-6 shadow-2 sm:p-8"
          >
            <div className="flex items-start gap-5">
              <div className="relative shrink-0">
                <ProgressRing value={ratio} size={72} stroke={5} label={`Day ${n}: ${Math.round(ratio * 100)}% done`} />
                <span className="absolute inset-0 flex items-center justify-center font-serif text-xl text-text">{n}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium tracking-[0.08em] text-text-3 uppercase">Day {n} of 7</p>
                <h2 className="mt-1 text-xl text-text">{meta?.title}</h2>
                <p className="mt-1 text-sm text-text-2">{meta?.subtitle}</p>
              </div>
            </div>

            <ul className="mt-7 grid gap-1 border-t border-line pt-5">
              {SECTIONS.map((sec) => {
                const isDone = view.sectionDone(sec);
                return (
                  <li key={sec} className="flex items-center gap-3 py-1.5 text-sm">
                    <span
                      className={`inline-flex size-6 items-center justify-center rounded-full ${isDone ? "bg-good-soft text-good" : "border border-line text-transparent"}`}
                      aria-hidden="true"
                    >
                      <CheckIcon size={14} strokeWidth={2.25} />
                    </span>
                    <span className={isDone ? "text-text-3" : "text-text"}>{SECTION_LABELS[sec]}</span>
                    <span className="ml-auto tabular text-text-3">
                      {isDone ? "Done" : `${view.sectionMinutes(sec)} min`}
                    </span>
                  </li>
                );
              })}
            </ul>

            <p className="mt-5 text-sm text-text-2">
              {completed ? "Finished. Day " + (n + 1) + " opens next." : started ? `${formatMinutes(left)} left` : `${formatMinutes(left)} in total. Pause any time — it saves itself.`}
            </p>

            <div className="mt-6 hidden md:block">
              <LinkButton href={primary.href} full>
                {primary.label}
                <ArrowRightIcon size={20} />
              </LinkButton>
            </div>
          </motion.article>

          {!storageAvailable() && (
            <p className="mt-4 text-sm text-text-3">
              This browser is not keeping data, so progress lasts until you close the tab.
            </p>
          )}
        </section>

        <aside className="grid content-start gap-10">
          <nav aria-label="Practice" className="grid gap-2">
            <h2 className="mb-1 font-sans text-xs font-medium tracking-[0.08em] text-text-3 uppercase">Practice</h2>
            <QuietRow href="/review/" icon={<CardsIcon />} title="Review cards" meta={due > 0 ? `${due} due` : "All clear"} />
            <QuietRow href="/coach/" icon={<ChatIcon />} title="Speak with the coach" meta="Voice" />
          </nav>

          <nav aria-label="Your week">
            <h2 className="mb-3 font-sans text-xs font-medium tracking-[0.08em] text-text-3 uppercase">Your week</h2>
            <ol className="grid gap-1">
              {listDays().map((d) => {
                const p = getDayProgress(state, d.number);
                const unlocked = isDayUnlocked(state, d.number);
                const isToday = d.number === n && !completed;
                const status = p.completedAt
                  ? "Done"
                  : !d.available
                    ? "Coming soon"
                    : isToday
                      ? "Today"
                      : unlocked
                        ? "Open"
                        : `After Day ${d.number - 1}`;
                const content = (
                  <>
                    <span
                      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm tabular ${
                        p.completedAt
                          ? "bg-good-soft text-good"
                          : isToday
                            ? "bg-accent text-accent-ink"
                            : "border border-line text-text-2"
                      }`}
                    >
                      {p.completedAt ? <CheckIcon size={16} strokeWidth={2.25} /> : d.number}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm ${d.available ? "text-text" : "text-text-3"}`}>{d.title}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-text-3">
                      {!unlocked && d.available && <LockIcon size={14} />}
                      {status}
                    </span>
                  </>
                );
                return (
                  <li key={d.number}>
                    {d.available ? (
                      <Link
                        href={`/day/${d.number}/`}
                        className="press flex min-h-12 items-center gap-3 rounded-md px-2 py-2 -mx-2 hover:bg-surface-2"
                      >
                        {content}
                      </Link>
                    ) : (
                      <div className="flex min-h-12 items-center gap-3 px-2 py-2 -mx-2" aria-disabled="true">
                        {content}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-bg from-60% to-transparent px-5 pt-8 pb-safe md:hidden">
        <LinkButton href={primary.href} full>
          {primary.label}
          <ArrowRightIcon size={20} />
        </LinkButton>
      </div>
    </main>
  );
}

function QuietRow({ href, icon, title, meta }: { href: string; icon: React.ReactNode; title: string; meta: string }) {
  return (
    <Link
      href={href}
      className="press -mx-2 flex min-h-14 items-center gap-3 rounded-md px-2 py-2 text-text hover:bg-surface-2"
    >
      <span className="inline-flex size-10 items-center justify-center rounded-full bg-surface-2 text-text-2">{icon}</span>
      <span className="flex-1 text-base">{title}</span>
      <span className="text-sm text-text-3">{meta}</span>
      <ChevronRightIcon size={18} className="text-text-3" />
    </Link>
  );
}

function HomeSkeleton() {
  return (
    <main className="mx-auto w-full max-w-5xl px-5 pt-safe sm:px-8" aria-busy="true" aria-label="Loading">
      <div className="flex h-16 items-center">
        <span className="font-serif text-lg tracking-tight text-text">B2 Sprint</span>
      </div>
      <div className="mt-6 grid gap-10 md:mt-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
        <div>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-3 h-9 w-72 max-w-full" />
          <Skeleton className="mt-8 h-80 w-full rounded-lg" />
        </div>
        <div className="grid content-start gap-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </div>
    </main>
  );
}
