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

/**
 * Merging the local state with the cloud copy. Pure and deterministic: merge(x, x) equals x,
 * and swapping the arguments gives the same data except where two values tie exactly (then
 * the first argument wins) and the order of doneSteps.
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

export function mergeStates(a: AppState, b: AppState): AppState {
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
  };
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
