import type { TenseGroup } from "@/lib/content/schema";

/** Every entry of the tense reference, in reading order. Each has content/tenses/<id>.ts. */
export const TENSE_IDS = [
  "be-rule",
  "present-simple",
  "present-continuous",
  "present-perfect",
  "present-perfect-continuous",
  "past-simple",
  "past-continuous",
  "past-perfect",
  "past-perfect-continuous",
  "future-simple",
  "going-to",
  "future-continuous",
  "future-perfect",
  "future-perfect-continuous",
  "time-clauses",
  "conditionals",
  "used-to",
  "sequence-of-tenses",
] as const;
export type TenseId = (typeof TENSE_IDS)[number];

export const TENSE_GROUP_OF: Record<TenseId, TenseGroup> = {
  "be-rule": "key",
  "present-simple": "present",
  "present-continuous": "present",
  "present-perfect": "present",
  "present-perfect-continuous": "present",
  "past-simple": "past",
  "past-continuous": "past",
  "past-perfect": "past",
  "past-perfect-continuous": "past",
  "future-simple": "future",
  "going-to": "future",
  "future-continuous": "future",
  "future-perfect": "future",
  "future-perfect-continuous": "future",
  "time-clauses": "key",
  conditionals: "key",
  "used-to": "key",
  "sequence-of-tenses": "key",
};
