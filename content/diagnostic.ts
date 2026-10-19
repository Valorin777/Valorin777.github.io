import type { z } from "zod";
import type { DiagnosticSchema } from "@/lib/content/schema";

/**
 * First-visit check: two items per known weak spot, the B1 item of every pair first,
 * so the whole check gets harder as it goes.
 */
export const diagnostic = [
  /* ------------------------------------------------------------- B1 items */
  {
    id: "diag-be-film-starts",
    prompt: "Hurry up! The film ___ in ten minutes.",
    options: ["is start", "starts", "is started", "starting"],
    answer: 1,
    category: "be-verb",
  },
  {
    id: "diag-vp-enjoy-trying",
    prompt: "I really enjoy ___ new recipes at the weekend.",
    options: ["to try", "try", "trying"],
    answer: 2,
    category: "verb-patterns",
  },
  {
    id: "diag-perf-since-2020",
    prompt: "I ___ for this company since 2020.",
    options: ["work", "have worked", "am working", "worked"],
    answer: 1,
    category: "perfect",
  },
  {
    id: "diag-coll-waste-of-money",
    prompt: "Buying a new phone every year is a ___ of money.",
    options: ["trash", "spending", "waste"],
    answer: 2,
    category: "collocations",
  },
  {
    id: "diag-count-advice",
    prompt: "My friend gave me ___ before the interview.",
    options: ["a useful advice", "some useful advice", "some useful advices", "useful advices"],
    answer: 1,
    category: "countable",
  },
  /* ------------------------------------------------------------- B2 items */
  {
    id: "diag-be-prices-risen",
    prompt: "Food prices ___ a lot since last year.",
    options: ["have risen", "are risen", "have been risen", "were risen"],
    answer: 0,
    category: "be-verb",
  },
  {
    id: "diag-vp-suggested-drinking",
    prompt: "My doctor suggested ___ less coffee.",
    options: ["to drink", "me to drink", "drinking", "drink"],
    answer: 2,
    category: "verb-patterns",
  },
  {
    id: "diag-perf-third-conditional",
    prompt: "If we ___ earlier, we wouldn't have missed the train.",
    options: ["left", "would leave", "have left", "had left"],
    answer: 3,
    category: "perfect",
  },
  {
    id: "diag-coll-carry-out-survey",
    prompt: "Last month our team ___ a survey of 500 customers.",
    options: ["carried on", "spent", "carried out"],
    answer: 2,
    category: "collocations",
  },
  {
    id: "diag-count-assistance",
    prompt: "If you need any ___ with your luggage, please call reception.",
    options: ["assistance", "assistant", "assistances"],
    answer: 0,
    category: "countable",
  },
] satisfies z.input<typeof DiagnosticSchema>;
