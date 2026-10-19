/*
 * Content check: `npx tsx scripts/check-content.ts` (npm run content:check).
 * Importing ../content/index already validates every file with Zod (it throws on bad content);
 * the lints below catch what the schema cannot: exercises that are unfair or ambiguous.
 * Relative imports keep the script runnable without a bundler.
 */
import type { Day, DayMeta, ErrorTapExercise, Exercise, ReorderExercise, Topic } from "../lib/content/schema";
import { DAYS, listDays } from "../content/index";

export interface Problem {
  where: string;
  message: string;
}

export type Lint = (days: Day[], meta: DayMeta[]) => Problem[];

const EXERCISE_TYPES: Exercise["type"][] = ["choice", "collocation", "fill", "errorTap", "reorder"];
const REQUIRED_TYPES: Exercise["type"][] = ["choice", "fill", "errorTap", "reorder"];
const MAX_RULE_CHARS = 60;
const MAX_FILL_WORDS = 4;
const MAX_SPEAK_WORDS = 12;
const REORDER_MIN = 4;
const REORDER_MAX = 9;
const WH_WORDS = new Set(["what", "where", "when", "why", "who", "whom", "whose", "which", "how"]);

const wordCount = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;
const gapCount = (s: string): number => (s.match(/_{3,}/g) ?? []).length;
const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
const isIForm = (w: string): boolean => /^I('[a-z]+)?$/.test(w);

function where(day: Day, topic?: Topic, id?: string): string {
  return [`day ${day.number}`, topic?.id, id].filter(Boolean).join(" / ");
}

/** Every string inside a value, for checks that apply to all text fields. */
function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}

export function errorTapProblems(e: ErrorTapExercise): string[] {
  const out: string[] = [];
  if (e.sentence !== e.sentence.trim() || / {2,}/.test(e.sentence)) out.push("sentence has extra spaces");
  if (e.correct === e.sentence) {
    out.push("correct is the same as sentence");
    return out;
  }
  const s = e.sentence.split(" ");
  const c = e.correct.split(" ");
  if (e.wrong >= s.length) return [...out, "wrong index out of range"];
  if (e.wrong === s.length - 1) out.push("the wrong token is the last one and carries the final punctuation");

  for (let i = 0; i < e.wrong; i++) {
    if (s[i] !== c[i]) out.push(`token ${i} ("${s[i]}") changes in correct, but only token ${e.wrong} should`);
  }
  const tailLen = s.length - e.wrong - 1;
  const cTailStart = c.length - tailLen;
  if (cTailStart < e.wrong) {
    out.push("correct is too short to differ only at the wrong token");
    return out;
  }
  for (let k = 0; k < tailLen; k++) {
    const si = e.wrong + 1 + k;
    const ci = cTailStart + k;
    // Deleting the first word moves the capital letter to the next one.
    const same = ci === 0 ? s[si].toLowerCase() === c[ci].toLowerCase() : s[si] === c[ci];
    if (!same) {
      out.push(`token ${si} ("${s[si]}") changes in correct, but only token ${e.wrong} should`);
    }
  }
  const replacement = c.slice(e.wrong, cTailStart);
  if (replacement.length > 2) out.push(`the fix replaces "${s[e.wrong]}" with more than two words`);
  if (replacement.join(" ") === s[e.wrong]) out.push("the wrong token is unchanged in correct");
  return out;
}

export function reorderProblems(e: ReorderExercise): string[] {
  const out: string[] = [];
  if (e.words.length < REORDER_MIN || e.words.length > REORDER_MAX) {
    out.push(`has ${e.words.length} words (allowed ${REORDER_MIN}–${REORDER_MAX})`);
  }
  e.words.forEach((w) => {
    if (/\s/.test(w)) out.push(`word "${w}" contains a space`);
    if (/[.,!?;:"()]/.test(w)) out.push(`word "${w}" contains punctuation`);
  });
  const first = e.words[0];
  if (first && /^\p{Lu}/u.test(first) && !isIForm(first)) {
    out.push(`first word "${first}" is capitalised and gives the answer away`);
  }
  if (WH_WORDS.has((first ?? "").toLowerCase()) && e.end !== "?" && e.end !== "!") out.push("starts with a wh-word but has no '?' end");
  const seen = new Set([e.words.join(" ")]);
  (e.alt ?? []).forEach((a) => {
    const key = a.join(" ");
    if (seen.has(key)) out.push(`duplicate alt order "${key}"`);
    seen.add(key);
    if ([...a].sort().join(" ") !== [...e.words].sort().join(" ")) out.push(`alt "${key}" uses different words`);
  });
  return out;
}

function exerciseProblems(e: Exercise): string[] {
  const out: string[] = [];
  if (e.rule.length > MAX_RULE_CHARS) out.push(`rule is ${e.rule.length} chars (max ${MAX_RULE_CHARS})`);
  switch (e.type) {
    case "choice":
    case "collocation": {
      const gaps = gapCount(e.prompt);
      if (e.type === "collocation" && gaps !== 1) out.push(`prompt needs exactly one ___ gap (has ${gaps})`);
      if (e.type === "choice" && gaps !== 1 && !(gaps === 0 && e.prompt.trim().endsWith("?"))) {
        out.push("prompt needs exactly one ___ gap or must be a question");
      }
      if (e.options.length < 3 || e.options.length > 4) out.push(`has ${e.options.length} options (want 3–4)`);
      const lower = e.options.map((o) => o.trim().toLowerCase());
      if (new Set(lower).size !== lower.length) out.push("options repeat");
      if (e.answer >= e.options.length) out.push("answer index out of range");
      break;
    }
    case "fill": {
      if (gapCount(e.before) + gapCount(e.after) > 0) out.push("before/after must not contain ___");
      if (!e.before && !e.after) out.push("before and after are both empty");
      if (e.before && !e.before.endsWith(" ")) out.push("before must end with a space");
      if (e.after && !/^[\s.,!?;:—–-]/.test(e.after)) out.push("after must start with a space or punctuation");
      e.answers.forEach((a) => {
        if (wordCount(a) > MAX_FILL_WORDS) out.push(`answer "${a}" is longer than ${MAX_FILL_WORDS} words`);
      });
      const lower = e.answers.map((a) => a.trim().toLowerCase());
      if (new Set(lower).size !== lower.length) out.push("answers repeat");
      break;
    }
    case "errorTap":
      out.push(...errorTapProblems(e));
      break;
    case "reorder":
      out.push(...reorderProblems(e));
      break;
  }
  return out;
}

function forEachTopic(days: Day[], fn: (day: Day, topic: Topic) => Problem[]): Problem[] {
  return days.flatMap((day) => day.topics.flatMap((topic) => fn(day, topic)));
}

export const LINTS: Record<string, Lint> = {
  "exercise integrity": (days) =>
    forEachTopic(days, (day, topic) =>
      topic.exercises.flatMap((e) =>
        exerciseProblems(e).map((message) => ({ where: where(day, topic, e.id), message })),
      ),
    ),

  "each topic mixes the exercise types": (days) =>
    forEachTopic(days, (day, topic) => {
      const types = new Set(topic.exercises.map((e) => e.type));
      return REQUIRED_TYPES.filter((t) => !types.has(t)).map((t) => ({
        where: where(day, topic),
        message: `no ${t} exercise`,
      }));
    }),

  "choice answers are not always at the same index": (days) =>
    forEachTopic(days, (day, topic) => {
      const answers = topic.exercises.flatMap((e) =>
        e.type === "choice" || e.type === "collocation" ? [e.answer] : [],
      );
      return answers.length >= 2 && new Set(answers).size === 1
        ? [{ where: where(day, topic), message: `every choice answer is option ${answers[0]}` }]
        : [];
    }),

  "most exercises have a Russian hint": (days) =>
    forEachTopic(days, (day, topic) => {
      const withHint = topic.exercises.filter((e) => e.ruHint).length;
      return withHint * 2 < topic.exercises.length
        ? [{ where: where(day, topic), message: `only ${withHint}/${topic.exercises.length} exercises have ruHint` }]
        : [];
    }),

  "examples are unique and translated": (days) =>
    days.flatMap((day) => {
      const seen = new Map<string, string>();
      return day.topics.flatMap((topic) =>
        topic.examples.flatMap((ex) => {
          const out: Problem[] = [];
          if (!ex.ru.trim()) out.push({ where: where(day, topic), message: `example "${ex.en}" has no ru` });
          const key = normalize(ex.en);
          const first = seen.get(key);
          if (first) out.push({ where: where(day, topic), message: `example "${ex.en}" repeats one in ${first}` });
          else seen.set(key, topic.id);
          return out;
        }),
      );
    }),

  "speak items are answerable": (days) =>
    days.flatMap((day) => {
      const prompts = new Set<string>();
      return day.speak.flatMap((item) => {
        const at = where(day, undefined, item.id);
        const out: Problem[] = [];
        if (item.en.length === 0) out.push({ where: at, message: "no accepted answers" });
        item.en.forEach((a) => {
          if (!a.trim()) out.push({ where: at, message: "empty answer" });
          if (wordCount(a) > MAX_SPEAK_WORDS) out.push({ where: at, message: `answer "${a}" is over ${MAX_SPEAK_WORDS} words` });
        });
        const keys = item.en.map((a) => a.trim().toLowerCase());
        if (new Set(keys).size !== keys.length) out.push({ where: at, message: "answers repeat" });
        if (prompts.has(item.ru)) out.push({ where: at, message: `prompt "${item.ru}" repeats` });
        prompts.add(item.ru);
        return out;
      });
    }),

  "phrases are unique": (days) =>
    days.flatMap((day) => {
      const seen = new Set<string>();
      return day.phrases.flatMap((p) => {
        const key = normalize(p.en);
        const dup = seen.has(key);
        seen.add(key);
        return dup ? [{ where: where(day), message: `phrase "${p.en}" repeats` }] : [];
      });
    }),

  "bold markup is balanced": (days) =>
    days.flatMap((day) =>
      collectStrings(day)
        .filter((s) => (s.match(/\*\*/g) ?? []).length % 2 !== 0)
        .map((s) => ({ where: where(day), message: `unbalanced ** in "${s}"` })),
    ),

  "day meta matches the content": (days, meta) => {
    const out: Problem[] = [];
    const numbers = meta.map((m) => m.number);
    if (numbers.join(",") !== "1,2,3,4,5,6,7") out.push({ where: "meta", message: `days are ${numbers.join(",")}, want 1–7` });
    meta.forEach((m) => {
      const day = days.find((d) => d.number === m.number);
      if (m.available && !day) out.push({ where: `meta day ${m.number}`, message: "available but has no content" });
      if (!m.available && day) out.push({ where: `meta day ${m.number}`, message: "has content but is not available" });
      if (day && day.title !== m.title) out.push({ where: `meta day ${m.number}`, message: "title differs from the day file" });
      if (day && day.subtitle !== m.subtitle) {
        out.push({ where: `meta day ${m.number}`, message: "subtitle differs from the day file" });
      }
    });
    return out;
  },
};

export function lintContent(days: Day[], meta: DayMeta[]): Problem[] {
  return Object.values(LINTS).flatMap((lint) => lint(days, meta));
}

export function summarize(days: Day[]): string {
  const lines: string[] = [];
  days.forEach((day) => {
    lines.push(
      `Day ${day.number} · ${day.title} — ${day.topics.length} topics, ${day.speak.length} speak, ${day.phrases.length} phrases`,
    );
    day.topics.forEach((t) => {
      const counts = EXERCISE_TYPES.map((type) => `${type} ${t.exercises.filter((e) => e.type === type).length}`);
      lines.push(
        `  ${t.id.padEnd(30)} rules ${t.rules.length} · mistakes ${t.mistakes.length} · examples ${t.examples.length} · exercises ${t.exercises.length} (${counts.join(", ")})`,
      );
    });
  });
  return lines.join("\n");
}

function main(): void {
  const meta = listDays();
  console.log(summarize(DAYS));
  const problems = lintContent(DAYS, meta);
  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s):`);
    problems.forEach((p) => console.error(`  ✗ ${p.where}: ${p.message}`));
    process.exitCode = 1;
    return;
  }
  console.log(`\nContent OK: ${DAYS.length} day(s), ${meta.length} in meta.`);
}

if (/check-content\.ts$/.test(process.argv[1] ?? "")) main();
