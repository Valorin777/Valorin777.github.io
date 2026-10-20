import type {
  AnswerRecord,
  AppState,
  Card,
  DayProgress,
  DiagnosticResult,
  ErrorEntry,
  FinalTestResult,
  Streak,
} from "@/types/state";
import { initialState } from "@/lib/progress";

/**
 * Merging the local state with the cloud copy. Pure and deterministic: merge(x, x) equals x,
 * and swapping the arguments gives the same data except where two values tie exactly (then
 * the first argument wins) and the order of doneSteps.
 *
 * Progress only ever grows in a merge (a union), so starting over is recorded as a time:
 * resetAt for the whole course, dayResets[n] for one day. A copy that has not seen the latest
 * reset first gives up everything it made before that time (by each item's own date: a day's
 * startedAt, a card's createdAt, a mistake's firstAt, a result's completedAt), so the cloud or
 * another device cannot bring cleared progress back, while work done after the reset on a
 * device that had not heard of it yet is kept.
 */

const timeOf = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
};

/** Compares two ISO times; the same instant written differently falls back to the text. */
function cmpTime(x: string, y: string): number {
  const d = timeOf(x) - timeOf(y);
  if (d !== 0 && !Number.isNaN(d)) return d < 0 ? -1 : 1;
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Like cmpTime, a missing time is the earliest of all. */
function cmpOptTime(x: string | undefined, y: string | undefined): number {
  if (x === undefined || y === undefined) return x === y ? 0 : x === undefined ? -1 : 1;
  return cmpTime(x, y);
}

const earliest = (x: string | undefined, y: string | undefined): string | undefined =>
  x === undefined ? y : y === undefined ? x : cmpTime(y, x) < 0 ? y : x;

/** The value from the later of two results; non-null beats null, a tie keeps `a`. */
function laterResult<T extends DiagnosticResult | FinalTestResult>(a: T | null, b: T | null): T | null {
  if (!a) return b;
  if (!b) return a;
  return cmpTime(b.completedAt, a.completedAt) > 0 ? b : a;
}

function mergeAnswer(a: AnswerRecord, b: AnswerRecord): AnswerRecord {
  return {
    correct: a.correct || b.correct,
    attempts: Math.max(a.attempts, b.attempts),
    firstTry: a.firstTry && b.firstTry,
  };
}

function mergeDay(a: DayProgress, b: DayProgress): DayProgress {
  const doneSteps = [...a.doneSteps, ...b.doneSteps.filter((id) => !a.doneSteps.includes(id))];
  const answers: Record<string, AnswerRecord> = { ...a.answers };
  for (const [key, record] of Object.entries(b.answers)) {
    const mine = answers[key];
    answers[key] = mine ? mergeAnswer(mine, record) : record;
  }
  const day: DayProgress = { doneSteps, answers, seconds: Math.max(a.seconds, b.seconds) };
  const startedAt = earliest(a.startedAt, b.startedAt);
  const completedAt = earliest(a.completedAt, b.completedAt);
  if (startedAt !== undefined) day.startedAt = startedAt;
  if (completedAt !== undefined) day.completedAt = completedAt;
  if (a.override === true || b.override === true) day.override = true;
  return day;
}

function pickCard(a: Card, b: Card): Card {
  const order =
    cmpOptTime(b.lastReviewedAt, a.lastReviewedAt) ||
    cmpTime(b.createdAt, a.createdAt) ||
    // Same review history: a wrong answer on one device made the card due again; keep that.
    (b.due < a.due ? 1 : 0);
  return order > 0 ? b : a;
}

function mergeError(a: ErrorEntry, b: ErrorEntry): ErrorEntry {
  const later = cmpTime(b.lastAt, a.lastAt) > 0 ? b : a;
  return {
    ...later,
    count: Math.max(a.count, b.count),
    firstAt: earliest(a.firstAt, b.firstAt) ?? later.firstAt,
    lastAt: later.lastAt,
  };
}

function mergeStreak(a: Streak, b: Streak): Streak {
  const aDay = a.lastDay ?? "";
  const bDay = b.lastDay ?? "";
  const from = bDay > aDay || (bDay === aDay && b.current > a.current) ? b : a;
  return { current: from.current, best: Math.max(a.best, b.best, from.current), lastDay: from.lastDay };
}

function mergeRecords<T>(a: Record<string, T>, b: Record<string, T>, pick: (x: T, y: T) => T): Record<string, T> {
  const out: Record<string, T> = { ...a };
  for (const [key, value] of Object.entries(b)) {
    if (key === "__proto__") continue;
    const mine = out[key];
    out[key] = mine === undefined ? value : pick(mine, value);
  }
  return out;
}

/** The later of two optional ISO times. */
const latest = (x: string | null | undefined, y: string | null | undefined): string | null =>
  !x ? (y ?? null) : !y ? x : cmpTime(y, x) > 0 ? y : x;

/** Made at or after the reset time: survives catching up to that reset. */
const madeSince = (made: string | undefined, at: string): boolean => made !== undefined && cmpTime(made, at) >= 0;

function keep<T>(record: Record<string, T>, ok: (value: T) => boolean): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => ok(value)));
}

/** A copy catching up to a whole-course reset at `at`: only what it made since then stays. */
function sinceReset(s: AppState, at: string): AppState {
  const days: Record<number, DayProgress> = {};
  for (const [key, day] of Object.entries(s.days)) if (madeSince(day.startedAt, at)) days[Number(key)] = day;
  return {
    ...s,
    diagnostic: s.diagnostic && madeSince(s.diagnostic.completedAt, at) ? s.diagnostic : null,
    finalTest: s.finalTest && madeSince(s.finalTest.completedAt, at) ? s.finalTest : null,
    position: s.position && days[s.position.day] ? s.position : null,
    days,
    cards: keep(s.cards, (c) => madeSince(c.createdAt, at)),
    errors: keep(s.errors, (e) => madeSince(e.firstAt, at)),
    // Streak days are calendar days: only a streak that went on after the reset day survives.
    streak: s.streak.lastDay && s.streak.lastDay > at.slice(0, 10) ? s.streak : initialState().streak,
    dayResets: keep(s.dayResets ?? {}, (t) => cmpTime(t, at) > 0),
  };
}

/** A copy catching up to one day started over at `at`. */
function sinceDayReset(s: AppState, day: number, at: string): AppState {
  const days = { ...s.days };
  if (days[day] && !madeSince(days[day].startedAt, at)) delete days[day];
  return {
    ...s,
    days,
    cards: keep(s.cards, (c) => c.day !== day || madeSince(c.createdAt, at)),
    errors: keep(s.errors, (e) => e.day !== day || madeSince(e.firstAt, at)),
    position: s.position?.day === day && !days[day] ? null : s.position,
    finalTest: day === 7 && s.finalTest && !madeSince(s.finalTest.completedAt, at) ? null : s.finalTest,
  };
}

/** Brings a copy up to the resets it has not seen yet (dayResets are all newer than resetAt). */
function catchUp(s: AppState, resetAt: string | null, dayResets: Record<number, string>): AppState {
  let out = s;
  if (resetAt && (!s.resetAt || cmpTime(s.resetAt, resetAt) < 0)) out = sinceReset(out, resetAt);
  for (const [key, at] of Object.entries(dayResets)) {
    const day = Number(key);
    const mine = s.dayResets?.[day];
    if (!mine || cmpTime(mine, at) < 0) out = sinceDayReset(out, day, at);
  }
  return out;
}

export function mergeStates(local: AppState, remote: AppState): AppState {
  // Copies written by older versions of the app have no reset times.
  const resetAt = latest(local.resetAt, remote.resetAt);
  const dayResets: Record<number, string> = { ...(local.dayResets ?? {}) };
  for (const [key, at] of Object.entries(remote.dayResets ?? {})) {
    const day = Number(key);
    const kept = latest(dayResets[day], at);
    if (kept) dayResets[day] = kept;
  }
  // Day resets older than the whole reset are history.
  for (const [key, at] of Object.entries(dayResets)) {
    if (resetAt && cmpTime(at, resetAt) <= 0) delete dayResets[Number(key)];
  }
  const a = catchUp(local, resetAt, dayResets);
  const b = catchUp(remote, resetAt, dayResets);
  const newer = cmpTime(b.updatedAt, a.updatedAt) > 0 ? b : a;
  const days: Record<number, DayProgress> = { ...a.days };
  for (const [key, day] of Object.entries(b.days)) {
    const n = Number(key);
    const mine = days[n];
    days[n] = mine ? mergeDay(mine, day) : day;
  }
  return {
    version: a.version,
    updatedAt: newer.updatedAt,
    settings: newer.settings,
    diagnostic: laterResult(a.diagnostic, b.diagnostic),
    finalTest: laterResult(a.finalTest, b.finalTest),
    position: newer.position,
    days,
    cards: mergeRecords(a.cards, b.cards, pickCard),
    errors: mergeRecords(a.errors, b.errors, mergeError),
    streak: mergeStreak(a.streak, b.streak),
    resetAt,
    dayResets,
  };
}

/**
 * True when a copy (the cloud) has not recorded a reset that the merged state has: it must be
 * written back at once, or a stale device that overwrote it would keep bringing old progress back.
 */
export function missesResets(copy: AppState, merged: AppState): boolean {
  if (merged.resetAt && (!copy.resetAt || cmpTime(copy.resetAt, merged.resetAt) < 0)) return true;
  return Object.entries(merged.dayResets ?? {}).some(([day, at]) => {
    const theirs = copy.dayResets?.[Number(day)];
    return !theirs || cmpTime(theirs, at) < 0;
  });
}

/** True when there is no learning data at all (settings, position and streak do not count). */
export function isEmptyProgress(s: AppState): boolean {
  return (
    Object.keys(s.days).length === 0 &&
    Object.keys(s.cards).length === 0 &&
    Object.keys(s.errors).length === 0 &&
    s.diagnostic === null &&
    s.finalTest === null
  );
}
