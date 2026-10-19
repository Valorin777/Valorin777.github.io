import { z } from "zod";

/**
 * Content schema for every lesson day. Content files under /content are parsed with these
 * schemas at build time (npm run content:check) and in unit tests, so a typo in a lesson
 * fails the build instead of reaching the learner.
 *
 * Inline markup allowed in any English or Russian text field: **bold** (shown in the accent
 * colour). Nothing else — keep content plain.
 */

/** Learner weak spots and topic families. The error log and mastery are grouped by these. */
export const CategorySchema = z.enum([
  "be-verb", // "is started", "I'm knew": be only with -ing or V3
  "tense-choice", // present simple vs continuous, state verbs
  "perfect", // perfect tenses, past perfect, third conditional time logic
  "conditionals",
  "verb-patterns", // gerund vs infinitive
  "passive-reported",
  "modals",
  "collocations", // incl. phrasal verbs and Russian calques
  "linking",
  "articles",
  "countable",
]);
export type Category = z.infer<typeof CategorySchema>;

export const CATEGORY_LABELS: Record<Category, string> = {
  "be-verb": "Be + verb",
  "tense-choice": "Choosing the tense",
  perfect: "Perfect tenses",
  conditionals: "Conditionals",
  "verb-patterns": "Verb patterns",
  "passive-reported": "Passive and reported speech",
  modals: "Modals",
  collocations: "Collocations",
  linking: "Linking words",
  articles: "Articles",
  countable: "Countable and uncountable",
};

const Id = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "ids are kebab-case: lowercase letters, digits, dashes");
const Text = z.string().trim().min(1);

/* ------------------------------------------------------------------ theory */

export const RuleStepSchema = z.discriminatedUnion("kind", [
  /** A sentence or two of explanation. */
  z.object({ kind: z.literal("text"), text: Text }),
  /** A pattern shown as chips, e.g. ["be", "+", "-ing"]. */
  z.object({ kind: z.literal("formula"), parts: z.array(Text).min(2).max(7) }),
  /** A small table (tense map, signal words…). Every row has as many cells as the head. */
  z
    .object({
      kind: z.literal("table"),
      head: z.array(Text).min(2).max(4),
      rows: z.array(z.array(Text)).min(1).max(8),
    })
    .refine((t) => t.rows.every((r) => r.length === t.head.length), {
      message: "every table row must have as many cells as the head",
    }),
  /** One example sentence, playable with TTS. */
  z.object({ kind: z.literal("example"), en: Text, ru: Text.optional() }),
  /** Signal words with a short note on use. */
  z.object({
    kind: z.literal("signals"),
    items: z.array(z.object({ word: Text, use: Text })).min(2).max(8),
  }),
  /** A short practical tip. */
  z.object({ kind: z.literal("tip"), text: Text }),
]);
export type RuleStep = z.infer<typeof RuleStepSchema>;

/** A theory card. Its steps are revealed one at a time. */
export const RuleCardSchema = z.object({
  id: Id,
  title: Text,
  steps: z.array(RuleStepSchema).min(1).max(6),
});
export type RuleCard = z.infer<typeof RuleCardSchema>;

/** "Common mistake vs correct". */
export const ContrastSchema = z.object({
  wrong: Text,
  right: Text,
  /** One short sentence: why the right version is right. */
  why: Text,
});
export type Contrast = z.infer<typeof ContrastSchema>;

export const ExampleSchema = z.object({
  en: Text,
  /** Russian translation, shown on request. */
  ru: Text,
});
export type Example = z.infer<typeof ExampleSchema>;

/* --------------------------------------------------------------- exercises */

const ExerciseBase = {
  id: Id,
  /** The rule in one line, shown with the feedback, e.g. "be + V3 = passive". */
  rule: Text,
  /** 1–2 sentences in simple English: why the answer is right. Shown on a wrong answer. */
  explain: Text,
  /** Optional Russian hint, shown only when the learner asks for it. */
  ruHint: Text.optional(),
};

/** Multiple choice. `prompt` contains exactly one "___" gap or is a question. */
export const ChoiceExerciseSchema = z
  .object({
    ...ExerciseBase,
    type: z.literal("choice"),
    prompt: Text,
    options: z.array(Text).min(2).max(4),
    answer: z.number().int().min(0),
  })
  .refine((e) => e.answer < e.options.length, { message: "answer index out of range" })
  .refine((e) => new Set(e.options).size === e.options.length, { message: "duplicate options" });

/** "Choose the natural collocation": same mechanics as choice, presented as word partners. */
export const CollocationExerciseSchema = z
  .object({
    ...ExerciseBase,
    type: z.literal("collocation"),
    /** Sentence with one "___" gap where the partner word goes. */
    prompt: Text,
    options: z.array(Text).min(2).max(4),
    answer: z.number().int().min(0),
  })
  .refine((e) => e.answer < e.options.length, { message: "answer index out of range" })
  .refine((e) => e.prompt.includes("___"), { message: "prompt needs a ___ gap" });

/** Fill in one gap with a short typed answer (one to four words). */
export const FillExerciseSchema = z.object({
  ...ExerciseBase,
  type: z.literal("fill"),
  /** Text before the gap. May be empty when the gap starts the sentence. */
  before: z.string(),
  /** Text after the gap, usually ending with punctuation. */
  after: z.string(),
  /** Accepted answers, the first is the model answer. Contractions are matched automatically. */
  answers: z.array(Text).min(1).max(6),
  /** Base form hint shown in brackets, e.g. "start". */
  base: Text.optional(),
});

/** Tap the wrong word. `sentence` is split on single spaces into tappable tokens. */
export const ErrorTapExerciseSchema = z
  .object({
    ...ExerciseBase,
    type: z.literal("errorTap"),
    sentence: Text,
    /** Index of the wrong token in sentence.split(" "). */
    wrong: z.number().int().min(0),
    /** The whole corrected sentence. */
    correct: Text,
  })
  .refine((e) => e.wrong < e.sentence.split(" ").length, { message: "wrong index out of range" });

/**
 * Put the words in order. `words` is the correct order; the player shuffles them.
 * Words are lowercase (except "I" and names) and carry no punctuation, so the first word
 * does not give the answer away; the player capitalises the result and adds `end`.
 */
export const ReorderExerciseSchema = z
  .object({
    ...ExerciseBase,
    type: z.literal("reorder"),
    words: z.array(Text).min(3).max(10),
    /** Sentence end added after the last word. Default ".". */
    end: z.enum([".", "?", "!"]).optional(),
    /** Other orders that are also correct, as full word arrays (same words). */
    alt: z.array(z.array(Text)).optional(),
  })
  .refine(
    (e) =>
      (e.alt ?? []).every(
        (a) => a.length === e.words.length && [...a].sort().join(" ") === [...e.words].sort().join(" "),
      ),
    { message: "every alt order must use exactly the same words" },
  );

export const ExerciseSchema = z.discriminatedUnion("type", [
  ChoiceExerciseSchema,
  CollocationExerciseSchema,
  FillExerciseSchema,
  ErrorTapExerciseSchema,
  ReorderExerciseSchema,
]);
export type Exercise = z.infer<typeof ExerciseSchema>;
export type ExerciseType = Exercise["type"];
export type ChoiceExercise = z.infer<typeof ChoiceExerciseSchema>;
export type CollocationExercise = z.infer<typeof CollocationExerciseSchema>;
export type FillExercise = z.infer<typeof FillExerciseSchema>;
export type ErrorTapExercise = z.infer<typeof ErrorTapExerciseSchema>;
export type ReorderExercise = z.infer<typeof ReorderExerciseSchema>;

/* ------------------------------------------------------------------ speaking */

/** Say it in English: the learner sees Russian and answers aloud (speech recognition). */
export const SpeakItemSchema = z.object({
  id: Id,
  ru: Text,
  /** Accepted English answers; the first is the model answer that is read aloud. */
  en: z.array(Text).min(1).max(6),
  category: CategorySchema,
  /** What this item trains, in a few words, e.g. "be + V3". */
  focus: Text,
});
export type SpeakItem = z.infer<typeof SpeakItemSchema>;

/** A new phrase that becomes a flashcard automatically. */
export const PhraseSchema = z.object({
  en: Text,
  ru: Text,
  category: CategorySchema,
});
export type Phrase = z.infer<typeof PhraseSchema>;

/* -------------------------------------------------------------- topic & day */

export const TopicSchema = z.object({
  id: Id,
  title: Text,
  /** One line under the title. */
  summary: Text,
  category: CategorySchema,
  rules: z.array(RuleCardSchema).min(1).max(4),
  mistakes: z.array(ContrastSchema).min(2).max(5),
  /** Note for Russian speakers, written in Russian. */
  ruNote: z.object({ text: Text, example: z.object({ ru: Text, en: Text }).optional() }),
  examples: z.array(ExampleSchema).min(8).max(12),
  exercises: z.array(ExerciseSchema).min(5).max(10),
});
export type Topic = z.infer<typeof TopicSchema>;

export const DaySchema = z
  .object({
    number: z.number().int().min(1).max(7),
    title: Text,
    subtitle: Text,
    /** What the learner can do after today, one sentence. */
    goal: Text,
    topics: z.array(TopicSchema).min(1).max(5),
    speak: z.array(SpeakItemSchema).min(6).max(14),
    phrases: z.array(PhraseSchema).min(4).max(30),
  })
  .superRefine((day, ctx) => {
    const ids = new Set<string>();
    const add = (id: string, path: (string | number)[]) => {
      if (ids.has(id)) ctx.addIssue({ code: "custom", message: `duplicate id "${id}"`, path });
      ids.add(id);
    };
    day.topics.forEach((t, ti) => {
      add(t.id, ["topics", ti, "id"]);
      t.rules.forEach((r, ri) => add(`${t.id}/${r.id}`, ["topics", ti, "rules", ri, "id"]));
      t.exercises.forEach((e, ei) => add(e.id, ["topics", ti, "exercises", ei, "id"]));
    });
    day.speak.forEach((s, si) => add(s.id, ["speak", si, "id"]));
  });
export type Day = z.infer<typeof DaySchema>;

/** What the home screen knows about every day, including days whose content is not out yet. */
export const DayMetaSchema = z.object({
  number: z.number().int().min(1).max(7),
  title: Text,
  subtitle: Text,
  available: z.boolean(),
});
export type DayMeta = z.infer<typeof DayMetaSchema>;

/** Type for authoring content files: `export const day1 = { ... } satisfies DayInput`. */
export type DayInput = z.input<typeof DaySchema>;

/* ------------------------------------------------------- Day 7: final test */

/** Use of English Part 1 gap: multiple-choice cloze, four options, one right. */
export const ChoiceGapSchema = z
  .object({
    options: z.array(Text).length(4),
    answer: z.number().int().min(0).max(3),
    category: CategorySchema,
    /** One sentence: why this option and not the others. */
    explain: Text,
  })
  .refine((g) => new Set(g.options).size === 4, { message: "duplicate options" });
export type ChoiceGap = z.infer<typeof ChoiceGapSchema>;

/** Use of English Part 2 gap: open cloze, exactly one word. */
export const OpenGapSchema = z.object({
  /** Accepted single words (no spaces), first is the model answer. */
  answers: z.array(Text.regex(/^[A-Za-z']+$/, "one word only")).min(1).max(4),
  category: CategorySchema,
  explain: Text,
});
export type OpenGap = z.infer<typeof OpenGapSchema>;

const gapMarkers = (text: string) => [...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));

function clozeText<G extends z.ZodTypeAny>(gap: G) {
  return z
    .object({
      id: Id,
      title: Text,
      /**
       * The text with numbered gaps {{1}}, {{2}}, … in reading order (numbers restart at 1 in
       * every text). Gap n is gaps[n - 1].
       */
      text: Text,
      gaps: z.array(gap).min(6).max(8),
    })
    .refine((t) => {
      const m = gapMarkers(t.text);
      return m.length === t.gaps.length && m.every((n, i) => n === i + 1);
    }, { message: "gap markers must be {{1}}…{{n}} in order, one per gap" });
}

export const ChoiceClozeSchema = clozeText(ChoiceGapSchema);
export const OpenClozeSchema = clozeText(OpenGapSchema);
export type ChoiceCloze = z.infer<typeof ChoiceClozeSchema>;
export type OpenCloze = z.infer<typeof OpenClozeSchema>;

export const FinalDaySchema = z.object({
  number: z.literal(7),
  title: Text,
  subtitle: Text,
  goal: Text,
  /** Two or three calm sentences shown before the test: format, timing, no pressure. */
  intro: Text,
  /** Use of English Part 1: multiple-choice cloze texts. */
  part1: z.array(ChoiceClozeSchema).min(2).max(2),
  /** Use of English Part 2: open cloze texts. */
  part2: z.array(OpenClozeSchema).min(2).max(2),
  /** Final spoken review across the whole course. */
  speak: z.array(SpeakItemSchema).min(8).max(14),
});
export type FinalDay = z.infer<typeof FinalDaySchema>;
export type FinalDayInput = z.input<typeof FinalDaySchema>;

/* -------------------------------------------------------------- diagnostic */

/** First-visit check: one gap, three or four options, tagged with the weak spot it probes. */
export const DiagnosticItemSchema = z
  .object({
    id: Id,
    prompt: Text.refine((p) => p.includes("___"), "prompt needs a ___ gap"),
    options: z.array(Text).min(3).max(4),
    answer: z.number().int().min(0),
    category: CategorySchema,
  })
  .refine((e) => e.answer < e.options.length, { message: "answer index out of range" });
export const DiagnosticSchema = z.array(DiagnosticItemSchema).min(8).max(12);
export type DiagnosticItem = z.infer<typeof DiagnosticItemSchema>;
