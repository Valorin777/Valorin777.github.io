import { z } from "zod";
import {
  DayMetaSchema,
  DaySchema,
  DiagnosticSchema,
  FinalDaySchema,
  type Day,
  type DayMeta,
  type DiagnosticItem,
  type FinalDay,
  type Topic,
} from "@/lib/content/schema";
import { day1 } from "@/content/days/day-1";
import { day2 } from "@/content/days/day-2";
import { day3 } from "@/content/days/day-3";
import { day4 } from "@/content/days/day-4";
import { day5 } from "@/content/days/day-5";
import { day6 } from "@/content/days/day-6";
import { day7 } from "@/content/days/day-7";
import { diagnostic } from "@/content/diagnostic";
import { dayMeta } from "@/content/days/meta";

/*
 * Parsed at module load: an invalid content file throws here, which fails the build,
 * the unit tests and `npm run content:check`.
 */
function parseOrThrow<S extends z.ZodType>(schema: S, input: unknown, label: string): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error(`Invalid content in ${label}:\n${z.prettifyError(result.error)}`);
  return result.data;
}

/** Every written day, ordered by number. */
export const DAYS: Day[] = [day1, day2, day3, day4, day5, day6]
  .map((d) => parseOrThrow(DaySchema, d, `day ${d.number}`))
  .sort((a, b) => a.number - b.number);

const META: DayMeta[] = dayMeta
  .map((m) => parseOrThrow(DayMetaSchema, m, `day meta ${m.number}`))
  .sort((a, b) => a.number - b.number);

/** The day's content, or null when that day is not written yet. */
export function getDay(n: number): Day | null {
  return DAYS.find((d) => d.number === n) ?? null;
}

/** All seven days for the home screen, including those not available yet. */
export function listDays(): DayMeta[] {
  return META;
}

export function findTopic(day: Day, topicId: string): Topic | undefined {
  return day.topics.find((t) => t.id === topicId);
}

const FINAL: FinalDay = parseOrThrow(FinalDaySchema, day7, "day 7");

/** Day 7: review, speaking and the Use of English test. */
export function getFinal(): FinalDay | null {
  return FINAL;
}

const DIAGNOSTIC: DiagnosticItem[] = parseOrThrow(DiagnosticSchema, diagnostic, "diagnostic");

/** First-visit quick check. */
export function getDiagnostic(): DiagnosticItem[] {
  return DIAGNOSTIC;
}
