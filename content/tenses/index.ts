import { z } from "zod";
import { TenseRefSchema, type TenseGroup, type TenseRef } from "@/lib/content/schema";
import { TENSE_IDS } from "./ids";
import { entry as beRule } from "./be-rule";
import { entry as presentSimple } from "./present-simple";
import { entry as presentContinuous } from "./present-continuous";
import { entry as presentPerfect } from "./present-perfect";
import { entry as presentPerfectContinuous } from "./present-perfect-continuous";
import { entry as pastSimple } from "./past-simple";
import { entry as pastContinuous } from "./past-continuous";
import { entry as pastPerfect } from "./past-perfect";
import { entry as pastPerfectContinuous } from "./past-perfect-continuous";
import { entry as futureSimple } from "./future-simple";
import { entry as goingTo } from "./going-to";
import { entry as futureContinuous } from "./future-continuous";
import { entry as futurePerfect } from "./future-perfect";
import { entry as futurePerfectContinuous } from "./future-perfect-continuous";
import { entry as timeClauses } from "./time-clauses";
import { entry as conditionals } from "./conditionals";
import { entry as usedTo } from "./used-to";
import { entry as sequenceOfTenses } from "./sequence-of-tenses";

const ENTRIES = [beRule, presentSimple, presentContinuous, presentPerfect, presentPerfectContinuous, pastSimple, pastContinuous, pastPerfect, pastPerfectContinuous, futureSimple, goingTo, futureContinuous, futurePerfect, futurePerfectContinuous, timeClauses, conditionals, usedTo, sequenceOfTenses];

/** Every entry of the tense reference, parsed at module load (an invalid file fails the build). */
export const TENSES: TenseRef[] = ENTRIES.map((e) => {
  const result = TenseRefSchema.safeParse(e);
  if (!result.success) throw new Error(`Invalid tense entry ${e.id}:\n${z.prettifyError(result.error)}`);
  return result.data;
}).sort((a, b) => TENSE_IDS.indexOf(a.id as never) - TENSE_IDS.indexOf(b.id as never));

export function getTense(id: string): TenseRef | null {
  return TENSES.find((t) => t.id === id) ?? null;
}

export function tensesIn(group: TenseGroup): TenseRef[] {
  return TENSES.filter((t) => t.group === group);
}

/** The classic 12-tense map: rows are aspects, columns past / present / future. */
export const TENSE_MAP: { aspect: string; cells: [string, string, string]; forms: [string, string, string] }[] = [
  { aspect: "Simple", cells: ["past-simple", "present-simple", "future-simple"], forms: ["I worked", "I work", "I'll work"] },
  { aspect: "Continuous", cells: ["past-continuous", "present-continuous", "future-continuous"], forms: ["I was working", "I'm working", "I'll be working"] },
  { aspect: "Perfect", cells: ["past-perfect", "present-perfect", "future-perfect"], forms: ["I had worked", "I've worked", "I'll have worked"] },
  {
    aspect: "Perfect continuous",
    cells: ["past-perfect-continuous", "present-perfect-continuous", "future-perfect-continuous"],
    forms: ["I had been working", "I've been working", "I'll have been working"],
  },
];
