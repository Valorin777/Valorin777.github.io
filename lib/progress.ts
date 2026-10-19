import { normalize } from "@/lib/answers";
import { CategorySchema } from "@/lib/content/schema";
import type { Category, Day, Phrase } from "@/lib/content/schema";
import { diffDays, isDay } from "@/lib/date";
import { isDue, MIN_EF, newSrs, review } from "@/lib/srs";
import type { Grade } from "@/lib/srs";
import type {
  AnswerRecord,
  AppState,
  Card,
  DayProgress,
  ErrorEntry,
  Position,
  Settings,
  Streak,
  ThemePref,
} from "@/types/state";

/**
 * Pure reducers over AppState. None of them mutates its input; when nothing changes they
 * return the same object so React can skip a render.
 */

export const STORAGE_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  voiceURI: null,
  rate: 0.95,
  sound: false,
  haptics: true,
  showRu: false,
};

export const RATE_MIN = 0.6;
export const RATE_MAX = 1.2;
const DAY_MIN = 1;
const DAY_MAX = 7;

export function initialState(): AppState {
  return {
    version: STORAGE_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    position: null,
    days: {},
    cards: {},
    errors: {},
    streak: { current: 0, best: 0, lastDay: null },
  };
}

export function emptyDay(): DayProgress {
  return { doneSteps: [], answers: {}, seconds: 0 };
}

/* --------------------------------------------------------------- migration */

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v : undefined);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const int = (v: unknown, min: number, fallback: number): number => {
  const n = num(v);
  return n === undefined ? fallback : Math.max(min, Math.floor(n));
};
const isDayNumber = (n: number): boolean => Number.isInteger(n) && n >= DAY_MIN && n <= DAY_MAX;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const entries = (v: unknown): [string, unknown][] =>
  isObj(v) ? Object.entries(v).filter(([k]) => !UNSAFE_KEYS.has(k)) : [];
const CATEGORIES: readonly string[] = CategorySchema.options;
const category = (v: unknown): Category | undefined =>
  typeof v === "string" && CATEGORIES.includes(v) ? (v as Category) : undefined;
const THEMES: readonly ThemePref[] = ["system", "light", "dark"];

const clampRate = (rate: number): number => Math.min(RATE_MAX, Math.max(RATE_MIN, rate));

function sanitizeSettings(raw: unknown, base: Settings): Settings {
  const o = isObj(raw) ? raw : {};
  const theme = THEMES.find((t) => t === o.theme) ?? base.theme;
  const voiceURI = o.voiceURI === null ? null : (text(o.voiceURI) ?? base.voiceURI);
  const rate = num(o.rate);
  return {
    theme,
    voiceURI,
    rate: clampRate(rate ?? base.rate),
    sound: bool(o.sound, base.sound),
    haptics: bool(o.haptics, base.haptics),
    showRu: bool(o.showRu, base.showRu),
  };
}

function migratePosition(raw: unknown): Position | null {
  if (!isObj(raw)) return null;
  const day = num(raw.day);
  const stepId = text(raw.stepId);
  return day !== undefined && isDayNumber(day) && stepId ? { day, stepId } : null;
}

function migrateDay(raw: unknown): DayProgress | null {
  if (!isObj(raw)) return null;
  const day = emptyDay();
  const startedAt = text(raw.startedAt);
  const completedAt = text(raw.completedAt);
  if (startedAt) day.startedAt = startedAt;
  if (completedAt) day.completedAt = completedAt;
  if (raw.override === true) day.override = true;
  if (Array.isArray(raw.doneSteps)) {
    day.doneSteps = [...new Set(raw.doneSteps.filter((s): s is string => typeof s === "string" && s !== ""))];
  }
  for (const [key, value] of entries(raw.answers)) {
    if (!isObj(value) || typeof value.correct !== "boolean") continue;
    const record: AnswerRecord = {
      correct: value.correct,
      attempts: int(value.attempts, 1, 1),
      firstTry: bool(value.firstTry, false),
    };
    day.answers[key] = record;
  }
  day.seconds = Math.max(0, num(raw.seconds) ?? 0);
  return day;
}

function migrateCard(id: string, raw: unknown): Card | null {
  if (!isObj(raw)) return null;
  const front = text(raw.front);
  const back = text(raw.back);
  const cat = category(raw.category);
  const source = raw.source === "mistake" || raw.source === "phrase" ? raw.source : undefined;
  if (!front || !back || !cat || !source) return null;
  const createdAt = text(raw.createdAt) ?? "1970-01-01T00:00:00.000Z";
  const createdDay = createdAt.slice(0, 10);
  const day = num(raw.day);
  const ef = num(raw.ef);
  const card: Card = {
    id,
    front,
    back,
    category: cat,
    source,
    day: day !== undefined && isDayNumber(day) ? day : DAY_MIN,
    createdAt,
    ef: ef === undefined ? 2.5 : Math.max(MIN_EF, ef),
    interval: int(raw.interval, 0, 0),
    reps: int(raw.reps, 0, 0),
    lapses: int(raw.lapses, 0, 0),
    // An unreadable due date makes the card due now rather than lost.
    due: isDay(raw.due) ? raw.due : isDay(createdDay) ? createdDay : "1970-01-01",
  };
  const note = text(raw.note);
  if (note) card.note = note;
  const lastReviewedAt = text(raw.lastReviewedAt);
  if (lastReviewedAt) card.lastReviewedAt = lastReviewedAt;
  return card;
}

function migrateError(key: string, raw: unknown): ErrorEntry | null {
  if (!isObj(raw)) return null;
  const cat = category(raw.category);
  const prompt = text(raw.prompt);
  const right = text(raw.right);
  if (!cat || !prompt || !right) return null;
  const day = num(raw.day);
  const lastAt = text(raw.lastAt) ?? text(raw.firstAt) ?? "1970-01-01T00:00:00.000Z";
  return {
    key,
    category: cat,
    day: day !== undefined && isDayNumber(day) ? day : DAY_MIN,
    prompt,
    wrong: str(raw.wrong) ?? "",
    right,
    rule: str(raw.rule) ?? "",
    count: int(raw.count, 1, 1),
    firstAt: text(raw.firstAt) ?? lastAt,
    lastAt,
  };
}

function migrateStreak(raw: unknown): Streak {
  if (!isObj(raw)) return { current: 0, best: 0, lastDay: null };
  const current = int(raw.current, 0, 0);
  const lastDay = isDay(raw.lastDay) ? raw.lastDay : null;
  return { current, best: Math.max(current, int(raw.best, 0, 0)), lastDay };
}

/** Reads whatever was stored (any version, partial or corrupt) into a valid AppState. Never throws. */
export function migrate(raw: unknown): AppState {
  try {
    let data = raw;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data) as unknown;
      } catch {
        return initialState();
      }
    }
    if (!isObj(data)) return initialState();

    const state = initialState();
    state.settings = sanitizeSettings(data.settings, DEFAULT_SETTINGS);
    state.position = migratePosition(data.position);
    for (const [key, value] of entries(data.days)) {
      const n = Number(key);
      const day = isDayNumber(n) ? migrateDay(value) : null;
      if (day) state.days[n] = day;
    }
    for (const [key, value] of entries(data.cards)) {
      const card = migrateCard(key, value);
      if (card) state.cards[key] = card;
    }
    for (const [key, value] of entries(data.errors)) {
      const entry = migrateError(key, value);
      if (entry) state.errors[key] = entry;
    }
    state.streak = migrateStreak(data.streak);
    return state;
  } catch {
    return initialState();
  }
}

/* -------------------------------------------------------------------- days */

export function getDayProgress(s: AppState, day: number): DayProgress {
  return s.days[day] ?? emptyDay();
}

function withDay(s: AppState, day: number, update: (d: DayProgress) => DayProgress): AppState {
  return { ...s, days: { ...s.days, [day]: update(getDayProgress(s, day)) } };
}

export function isDayUnlocked(s: AppState, day: number): boolean {
  if (day === 1) return true;
  if (!Number.isInteger(day) || day < 1) return false;
  return Boolean(s.days[day - 1]?.completedAt) || s.days[day]?.override === true;
}

export function setOverride(s: AppState, day: number): AppState {
  if (s.days[day]?.override === true) return s;
  return withDay(s, day, (d) => ({ ...d, override: true }));
}

export function startDay(s: AppState, day: number, nowIso: string): AppState {
  if (s.days[day]?.startedAt) return s;
  return withDay(s, day, (d) => ({ ...d, startedAt: nowIso }));
}

export function completeStep(
  s: AppState,
  day: number,
  stepId: string,
  nextStepId: string | null,
  nowIso: string,
): AppState {
  const next = withDay(s, day, (d) => {
    const updated: DayProgress = {
      ...d,
      startedAt: d.startedAt ?? nowIso,
      doneSteps: d.doneSteps.includes(stepId) ? d.doneSteps : [...d.doneSteps, stepId],
    };
    if (stepId === "done" && !d.completedAt) updated.completedAt = nowIso;
    return updated;
  });
  return nextStepId ? { ...next, position: { day, stepId: nextStepId } } : next;
}

export function setPosition(s: AppState, day: number, stepId: string): AppState {
  if (s.position?.day === day && s.position.stepId === stepId) return s;
  return { ...s, position: { day, stepId } };
}

export function addSeconds(s: AppState, day: number, seconds: number): AppState {
  if (!Number.isFinite(seconds) || seconds <= 0) return s;
  return withDay(s, day, (d) => ({ ...d, seconds: d.seconds + seconds }));
}

/* ----------------------------------------------------------------- answers */

export interface AnswerInput {
  day: number;
  key: string;
  correct: boolean;
  category: Category;
  prompt: string;
  given: string;
  right: string;
  rule: string;
  nowIso: string;
  today: string;
}

export const mistakeCardId = (key: string): string => `m:${key}`;

/**
 * Stores one answer. A wrong answer also lands in the error log and becomes a flashcard
 * ("m:<key>"), or makes that flashcard due again today if it already exists.
 */
export function recordAnswer(s: AppState, a: AnswerInput): AppState {
  const next = withDay(s, a.day, (d) => {
    const prev = d.answers[a.key];
    const record: AnswerRecord = prev
      ? {
          correct: prev.correct || a.correct,
          // attempts counts tries until the first correct answer, so it stops growing then.
          attempts: prev.correct ? prev.attempts : prev.attempts + 1,
          firstTry: prev.firstTry,
        }
      : { correct: a.correct, attempts: 1, firstTry: a.correct };
    return { ...d, answers: { ...d.answers, [a.key]: record } };
  });
  if (a.correct) return next;

  const prevError = s.errors[a.key];
  const error: ErrorEntry = prevError
    ? { ...prevError, count: prevError.count + 1, wrong: a.given, lastAt: a.nowIso }
    : {
        key: a.key,
        category: a.category,
        day: a.day,
        prompt: a.prompt,
        wrong: a.given,
        right: a.right,
        rule: a.rule,
        count: 1,
        firstAt: a.nowIso,
        lastAt: a.nowIso,
      };

  const id = mistakeCardId(a.key);
  const prevCard = s.cards[id];
  let card: Card;
  if (!prevCard) {
    card = {
      id,
      front: a.prompt,
      back: a.right,
      category: a.category,
      source: "mistake",
      day: a.day,
      createdAt: a.nowIso,
      ...newSrs(a.today),
    };
    if (a.rule.trim() !== "") card.note = a.rule;
  } else {
    card = isDue(prevCard, a.today) ? prevCard : { ...prevCard, due: a.today };
  }

  return {
    ...next,
    errors: { ...next.errors, [a.key]: error },
    cards: card === prevCard ? next.cards : { ...next.cards, [id]: card },
  };
}

/* ------------------------------------------------------------------- cards */

function slug(s: string): string {
  return normalize(s)
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function phraseCardId(en: string): string {
  const s = slug(en);
  return `p:${s === "" ? hash(en) : s}`;
}

export function addPhraseCards(
  s: AppState,
  day: number,
  phrases: readonly Phrase[],
  today: string,
  nowIso: string,
): AppState {
  const added: Record<string, Card> = {};
  for (const p of phrases) {
    const id = phraseCardId(p.en);
    if (s.cards[id] || added[id]) continue;
    added[id] = {
      id,
      front: p.ru,
      back: p.en,
      category: p.category,
      source: "phrase",
      day,
      createdAt: nowIso,
      ...newSrs(today),
    };
  }
  if (Object.keys(added).length === 0) return s;
  return { ...s, cards: { ...s.cards, ...added } };
}

export function reviewCard(s: AppState, cardId: string, grade: Grade, today: string, nowIso: string): AppState {
  const card = s.cards[cardId];
  if (!card) return s;
  return { ...s, cards: { ...s.cards, [cardId]: { ...review(card, grade, today), lastReviewedAt: nowIso } } };
}

export function dueCount(s: AppState, today: string): number {
  return Object.values(s.cards).filter((c) => isDue(c, today)).length;
}

/* ------------------------------------------------------------------ streak */

export function touchStreak(s: AppState, today: string): AppState {
  const { lastDay, current, best } = s.streak;
  if (lastDay === today) return s;
  const gap = lastDay ? diffDays(lastDay, today) : Number.NaN;
  // A clock that moved backwards must not wipe the streak.
  if (gap < 0) return s;
  const nextCurrent = gap === 1 ? current + 1 : 1;
  return { ...s, streak: { current: nextCurrent, best: Math.max(best, nextCurrent), lastDay: today } };
}

/* ---------------------------------------------------------------- settings */

export function updateSettings(s: AppState, patch: Partial<Settings>): AppState {
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  return { ...s, settings: sanitizeSettings({ ...s.settings, ...defined }, s.settings) };
}

export function resetProgress(s: AppState): AppState {
  return { ...initialState(), settings: { ...s.settings } };
}

/* ----------------------------------------------------------------- mastery */

export interface TopicMastery {
  topicId: string;
  title: string;
  category: Category;
  correct: number;
  total: number;
  ratio: number;
}

/** Per topic: share of answered exercises that were right on the first try. */
export function topicMastery(day: Day, p: DayProgress): TopicMastery[] {
  return day.topics.map((topic) => {
    let answered = 0;
    let correct = 0;
    for (const ex of topic.exercises) {
      const record = p.answers[ex.id];
      if (!record) continue;
      answered++;
      if (record.firstTry) correct++;
    }
    return {
      topicId: topic.id,
      title: topic.title,
      category: topic.category,
      correct,
      total: topic.exercises.length,
      ratio: answered === 0 ? 0 : correct / answered,
    };
  });
}

export function topErrors(s: AppState, limit = 10): ErrorEntry[] {
  return Object.values(s.errors)
    .sort((a, b) => b.count - a.count || (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0))
    .slice(0, Math.max(0, limit));
}
