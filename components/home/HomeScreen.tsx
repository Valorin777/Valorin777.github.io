"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useMemo, type ReactNode } from "react";
import { DAYS, getDay, getFinal, listDays } from "@/content";
import { LinkButton } from "@/components/ui/Button";
import {
  ArrowRightIcon,
  BookIcon,
  CardsIcon,
  ChatIcon,
  ClockIcon,
  CheckIcon,
  ChevronRightIcon,
  FlameIcon,
  LockIcon,
  RefreshIcon,
  SettingsIcon,
  SparkIcon,
} from "@/components/ui/Icons";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Skeleton } from "@/components/ui/Skeleton";
import { today } from "@/lib/date";
import { drillSize } from "@/lib/drill";
import { dueCount, getDayProgress, isDayUnlocked } from "@/lib/progress";
import { buildSteps, formatMinutes, progressRatio, remainingSeconds, sectionBounds, SECTION_LABELS, type Section } from "@/lib/steps";
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
  if (s.position && s.position.day >= 1) {
    const meta = metas.find((m) => m.number === s.position?.day);
    if (meta?.available && !getDayProgress(s, meta.number).completedAt) return meta.number;
  }
  const open = metas.find((m) => m.available && isDayUnlocked(s, m.number) && !getDayProgress(s, m.number).completedAt);
  if (open) return open.number;
  const lastDone = [...metas].reverse().find((m) => getDayProgress(s, m.number).completedAt);
  return lastDone?.number ?? 1;
}

interface Row {
  label: string;
  done: boolean;
  meta: string;
}

interface DayView {
  n: number;
  title: string;
  subtitle: string;
  ratio: number;
  leftText: string;
  rows: Row[];
  started: boolean;
  completed: boolean;
}

const SECTIONS: Section[] = ["learn", "speak", "review"];

function dayView(s: AppState, n: number): DayView {
  const meta = listDays().find((m) => m.number === n);
  const progress = getDayProgress(s, n);
  const done = new Set(progress.doneSteps);
  const base = {
    n,
    title: meta?.title ?? `Day ${n}`,
    subtitle: meta?.subtitle ?? "",
    started: progress.doneSteps.length > 0,
    completed: Boolean(progress.completedAt),
  };
  const day = getDay(n);
  if (day) {
    const steps = buildSteps(day);
    const bounds = sectionBounds(steps);
    const left = remainingSeconds(steps, progress.doneSteps);
    return {
      ...base,
      ratio: progressRatio(steps, progress.doneSteps),
      leftText: base.started ? `${formatMinutes(left)} left` : `${formatMinutes(left)} in total. Pause any time — it saves itself.`,
      rows: SECTIONS.map((sec) => {
        const isDone = steps.slice(bounds[sec].start, bounds[sec].end).every((st) => done.has(st.id));
        return { label: SECTION_LABELS[sec], done: isDone, meta: isDone ? "Done" : `${Math.max(1, Math.round(bounds[sec].seconds / 60))} min` };
      }),
    };
  }
  const final = n === 7 ? getFinal() : null;
  if (final) {
    const speakIds = final.speak.map((x) => `speak:${x.id}`);
    const testIds = [...final.part1, ...final.part2].map((t, i) => `${i < final.part1.length ? "p1" : "p2"}:${t.id}`);
    const total = 2 + speakIds.length + testIds.length;
    const count = progress.doneSteps.filter((id) => id !== "done" && id !== "report").length;
    return {
      ...base,
      ratio: base.completed ? 1 : Math.min(1, count / total),
      leftText: base.completed ? "Finished." : base.started ? "Pick up the test where you left it." : "About 30 minutes. Your answers are kept if you pause.",
      rows: [
        { label: "Your mistakes", done: done.has("errors"), meta: done.has("errors") ? "Done" : "3 min" },
        { label: "Speaking", done: speakIds.every((id) => done.has(id)), meta: speakIds.every((id) => done.has(id)) ? "Done" : "6 min" },
        { label: "Use of English test", done: testIds.every((id) => done.has(id)), meta: testIds.every((id) => done.has(id)) ? "Done" : "20 min" },
      ],
    };
  }
  return { ...base, ratio: 0, leftText: "Arrives in the next update.", rows: [] };
}

export function HomeScreen() {
  const hydrated = useHydrated();
  const state = useAppState();

  const view = useMemo(() => {
    const n = currentDayNumber(state);
    const t = today();
    return {
      day: dayView(state, n),
      due: dueCount(state, t),
      drill: drillSize(state, DAYS, t),
      mistakes: Object.keys(state.errors).length,
      fresh: !state.diagnostic && Object.keys(state.days).length === 0,
      courseDone: Boolean(getDayProgress(state, 7).completedAt),
    };
  }, [state]);

  if (!hydrated) return <HomeSkeleton />;

  const { day, due, drill, mistakes, fresh, courseDone } = view;
  const primary = fresh
    ? { href: "/check/", label: "Start" }
    : !day.completed
      ? { href: `/day/${day.n}/`, label: day.started ? "Continue" : `Start Day ${day.n}` }
      : drill > 0
        ? { href: "/drill/", label: `Daily drill · ${drill}` }
        : due > 0
          ? { href: "/review/", label: `Review ${due} card${due === 1 ? "" : "s"}` }
          : { href: "/coach/", label: "Talk with the coach" };

  const heading = fresh
    ? "Seven days to B2. Your first one starts here."
    : courseDone
      ? "You finished the course."
      : day.completed
        ? `Day ${day.n} is done.`
        : day.started
          ? "Pick up where you left off."
          : `Day ${day.n} is ready.`;

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
            {heading}
          </h1>
          {state.streak.current > 0 && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-text-2">
              <FlameIcon size={18} className="text-warm" />
              <span>{state.streak.current}-day streak</span>
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
                <ProgressRing value={day.ratio} size={72} stroke={5} label={`Day ${day.n}: ${Math.round(day.ratio * 100)}% done`} />
                <span className="absolute inset-0 flex items-center justify-center font-serif text-xl text-text">{day.n}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium tracking-[0.08em] text-text-3 uppercase">Day {day.n} of 7</p>
                <h2 className="mt-1 text-xl text-text">{day.title}</h2>
                <p className="mt-1 text-sm text-text-2">{day.subtitle}</p>
              </div>
            </div>

            {day.rows.length > 0 && (
              <ul className="mt-7 grid gap-1 border-t border-line pt-5">
                {day.rows.map((r) => (
                  <li key={r.label} className="flex items-center gap-3 py-1.5 text-sm">
                    <span
                      className={`inline-flex size-6 items-center justify-center rounded-full ${r.done ? "bg-good-soft text-good" : "border border-line text-transparent"}`}
                      aria-hidden="true"
                    >
                      <CheckIcon size={14} strokeWidth={2.25} />
                    </span>
                    <span className={r.done ? "text-text-3" : "text-text"}>{r.label}</span>
                    <span className="ml-auto tabular text-text-3">{r.meta}</span>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-5 text-sm text-text-2">
              {fresh ? "First a one-minute check of what to focus on — you can skip it." : day.completed ? "Finished. Keep the habit with a short drill and your cards." : day.leftText}
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
          <nav aria-label="Practice" className="grid gap-1">
            <h2 className="mb-2 font-sans text-xs font-medium tracking-[0.08em] text-text-3 uppercase">Practice</h2>
            {drill > 0 && <QuietRow href="/drill/" icon={<RefreshIcon />} title="Daily drill" meta={`${drill} items`} />}
            <QuietRow href="/review/" icon={<CardsIcon />} title="Review cards" meta={due > 0 ? `${due} due` : "All clear"} />
            <QuietRow href="/tenses/" icon={<ClockIcon />} title="All the tenses" meta="Rules + practice" />
            <QuietRow href="/coach/" icon={<ChatIcon />} title="Speak with the coach" meta="Voice" />
            <QuietRow href="/translate/" icon={<BookIcon />} title="Translator" meta="EN ⇄ RU" />
            {mistakes > 0 && <QuietRow href="/mistakes/" icon={<SparkIcon />} title="Top mistakes" meta={`${mistakes}`} />}
          </nav>

          <nav aria-label="Your week">
            <h2 className="mb-3 font-sans text-xs font-medium tracking-[0.08em] text-text-3 uppercase">Your week</h2>
            <ol className="grid gap-1">
              {listDays().map((d) => {
                const p = getDayProgress(state, d.number);
                const unlocked = isDayUnlocked(state, d.number);
                const isToday = d.number === day.n && !day.completed;
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
                        p.completedAt ? "bg-good-soft text-good" : isToday ? "bg-accent text-accent-ink" : "border border-line text-text-2"
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
                      <Link href={`/day/${d.number}/`} className="press -mx-2 flex min-h-12 items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-2">
                        {content}
                      </Link>
                    ) : (
                      <div className="-mx-2 flex min-h-12 items-center gap-3 px-2 py-2" aria-disabled="true">
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

function QuietRow({ href, icon, title, meta }: { href: string; icon: ReactNode; title: string; meta: string }) {
  return (
    <Link href={href} className="press -mx-2 flex min-h-14 items-center gap-3 rounded-md px-2 py-2 text-text hover:bg-surface-2">
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
