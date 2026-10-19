import type { z } from "zod";
import type { DayMetaSchema } from "@/lib/content/schema";

type DayMetaInput = z.input<typeof DayMetaSchema>;

/** Every day of the course, including days whose content is not written yet. */
export const dayMeta = [
  {
    number: 1,
    title: "The tense map",
    subtitle: "Be + verb, present and past, perfect tenses",
    available: true,
  },
  {
    number: 2,
    title: "Conditionals",
    subtitle: "Zero to third, mixed conditionals and wish",
    available: false,
  },
  {
    number: 3,
    title: "Verb patterns",
    subtitle: "Gerund or infinitive, stop/remember/try, look forward to + -ing",
    available: false,
  },
  {
    number: 4,
    title: "Passive, reported speech, deduction",
    subtitle: "The passive, reporting what people said, must/might/can't have",
    available: false,
  },
  {
    number: 5,
    title: "Word partners",
    subtitle: "Collocations and phrasal verbs",
    available: false,
  },
  {
    number: 6,
    title: "Linking, articles, countables",
    subtitle: "Linking words, a/the/no article, countable and uncountable nouns",
    available: false,
  },
  {
    number: 7,
    title: "Review and test",
    subtitle: "Your error log, a full review and a B2-style test",
    available: false,
  },
] satisfies DayMetaInput[];
