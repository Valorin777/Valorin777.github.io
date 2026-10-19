/*
 * Validate the Day 7 test and the first-visit diagnostic before they are wired in:
 *   npx tsx scripts/validate-final.ts
 * Runs the Zod schemas, then the checks the schema cannot express. Exits 1 on any problem.
 * Relative imports keep the script runnable without a bundler.
 */
import {
  CategorySchema,
  DiagnosticSchema,
  FinalDaySchema,
  type Category,
  type DiagnosticItem,
  type FinalDay,
} from "../lib/content/schema";
import { day7 } from "../content/days/day-7";
import { diagnostic } from "../content/diagnostic";
import { dayMeta } from "../content/days/meta";

export const TEXT_MIN_WORDS = 140;
export const TEXT_MAX_WORDS = 200;
const MAX_SPEAK_WORDS = 12;
/** No answer index may be right for more than this share of the Part 1 gaps. */
const MAX_INDEX_SHARE = 0.4;
const WEAK_SPOTS: readonly Category[] = ["be-verb", "verb-patterns", "perfect", "collocations", "countable"];

const MARKER = /\{\{\d+\}\}/g;

/** Words in a cloze text, gap markers excluded. */
export function clozeWordCount(text: string): number {
  return text
    .replace(MARKER, " ")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

const lowerSet = (xs: readonly string[]) => new Set(xs.map((x) => x.trim().toLowerCase()));

export function finalDayProblems(day: FinalDay, meta?: { title: string; subtitle: string }): string[] {
  const out: string[] = [];
  if (meta && day.title !== meta.title) out.push(`title "${day.title}" differs from meta "${meta.title}"`);
  if (meta && day.subtitle !== meta.subtitle) out.push(`subtitle differs from meta "${meta.subtitle}"`);

  const texts = [...day.part1, ...day.part2];
  const ids = texts.map((t) => t.id);
  if (new Set(ids).size !== ids.length) out.push("cloze text ids repeat");

  texts.forEach((t) => {
    const words = clozeWordCount(t.text);
    if (words < TEXT_MIN_WORDS || words > TEXT_MAX_WORDS) {
      out.push(`${t.id}: ${words} words (want ${TEXT_MIN_WORDS}–${TEXT_MAX_WORDS})`);
    }
    if (/_{3,}/.test(t.text)) out.push(`${t.id}: uses ___ instead of {{n}} markers`);
  });

  day.part1.forEach((t) => {
    t.gaps.forEach((g, i) => {
      if (lowerSet(g.options).size !== g.options.length) out.push(`${t.id} gap ${i + 1}: options repeat`);
    });
    if (new Set(t.gaps.map((g) => g.answer)).size === 1) out.push(`${t.id}: every answer is option ${t.gaps[0]?.answer}`);
  });

  const part1Answers = day.part1.flatMap((t) => t.gaps.map((g) => g.answer));
  [0, 1, 2, 3].forEach((n) => {
    const count = part1Answers.filter((a) => a === n).length;
    if (count === 0) out.push(`Part 1: option ${"ABCD"[n]} is never the answer`);
    if (count > part1Answers.length * MAX_INDEX_SHARE) {
      out.push(`Part 1: option ${"ABCD"[n]} is the answer ${count}/${part1Answers.length} times`);
    }
  });

  day.part2.forEach((t) => {
    t.gaps.forEach((g, i) => {
      g.answers.forEach((a) => {
        if (!/^[A-Za-z']+$/.test(a)) out.push(`${t.id} gap ${i + 1}: "${a}" is not a single word`);
        if (a !== a.toLowerCase()) out.push(`${t.id} gap ${i + 1}: "${a}" should be lowercase`);
      });
      if (lowerSet(g.answers).size !== g.answers.length) out.push(`${t.id} gap ${i + 1}: answers repeat`);
    });
  });

  const used = new Set(texts.flatMap((t) => t.gaps.map((g) => g.category)));
  CategorySchema.options.filter((c) => !used.has(c)).forEach((c) => out.push(`no gap tests "${c}"`));

  const speakIds = day.speak.map((s) => s.id);
  if (new Set(speakIds).size !== speakIds.length) out.push("speak ids repeat");
  const prompts = day.speak.map((s) => s.ru);
  if (new Set(prompts).size !== prompts.length) out.push("speak prompts repeat");
  day.speak.forEach((s) => {
    if (lowerSet(s.en).size !== s.en.length) out.push(`${s.id}: answers repeat`);
    s.en.forEach((a) => {
      if (a.split(/\s+/).length > MAX_SPEAK_WORDS) out.push(`${s.id}: "${a}" is over ${MAX_SPEAK_WORDS} words`);
    });
  });
  const speakCategories = new Set(day.speak.map((s) => s.category));
  CategorySchema.options
    .filter((c) => !speakCategories.has(c))
    .forEach((c) => out.push(`no speak item for "${c}"`));
  return out;
}

export function diagnosticProblems(items: readonly DiagnosticItem[]): string[] {
  const out: string[] = [];
  const ids = items.map((d) => d.id);
  if (new Set(ids).size !== ids.length) out.push("diagnostic ids repeat");
  items.forEach((d) => {
    const gaps = (d.prompt.match(/_{3,}/g) ?? []).length;
    if (gaps !== 1) out.push(`${d.id}: prompt has ${gaps} gaps (want 1)`);
    if (lowerSet(d.options).size !== d.options.length) out.push(`${d.id}: options repeat`);
  });
  WEAK_SPOTS.forEach((c) => {
    const n = items.filter((d) => d.category === c).length;
    if (n !== 2) out.push(`diagnostic has ${n} "${c}" items (want 2)`);
  });
  items
    .filter((d) => !WEAK_SPOTS.includes(d.category))
    .forEach((d) => out.push(`${d.id}: "${d.category}" is not one of the five weak spots`));
  if (new Set(items.map((d) => d.answer)).size < 3) out.push("diagnostic answers use fewer than 3 positions");
  return out;
}

export function summarizeFinal(day: FinalDay, items: readonly DiagnosticItem[]): string {
  const lines: string[] = [`Day 7 · ${day.title}`];
  const texts = [
    ...day.part1.map((t) => ({ part: 1, t, answers: t.gaps.map((g) => "ABCD"[g.answer]).join("") })),
    ...day.part2.map((t) => ({ part: 2, t, answers: t.gaps.map((g) => g.answers.join("/")).join(", ") })),
  ];
  texts.forEach(({ part, t, answers }) => {
    lines.push(`  Part ${part} ${t.id.padEnd(22)} ${String(clozeWordCount(t.text)).padStart(3)} words · ${t.gaps.length} gaps · ${answers}`);
  });
  const counts = new Map<Category, number>();
  texts.forEach(({ t }) => t.gaps.forEach((g) => counts.set(g.category, (counts.get(g.category) ?? 0) + 1)));
  lines.push("  Gaps by category:");
  CategorySchema.options.forEach((c) => lines.push(`    ${c.padEnd(18)} ${counts.get(c) ?? 0}`));
  lines.push(`  Speak items: ${day.speak.length}`);
  const diagByCat = WEAK_SPOTS.map((c) => `${c} ${items.filter((d) => d.category === c).length}`).join(", ");
  lines.push(`Diagnostic · ${items.length} items (${diagByCat})`);
  return lines.join("\n");
}

function main(): void {
  const parsedDay = FinalDaySchema.safeParse(day7);
  const parsedDiag = DiagnosticSchema.safeParse(diagnostic);
  const schemaIssues = [
    ...(parsedDay.success ? [] : parsedDay.error.issues.map((i) => `day7.${i.path.join(".")}: ${i.message}`)),
    ...(parsedDiag.success ? [] : parsedDiag.error.issues.map((i) => `diagnostic.${i.path.join(".")}: ${i.message}`)),
  ];
  if (!parsedDay.success || !parsedDiag.success) {
    schemaIssues.forEach((m) => console.error(`✗ ${m}`));
    process.exit(1);
  }
  const meta = dayMeta.find((m) => m.number === 7);
  const problems = [...finalDayProblems(parsedDay.data, meta), ...diagnosticProblems(parsedDiag.data)];
  console.log(summarizeFinal(parsedDay.data, parsedDiag.data));
  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s):`);
    problems.forEach((p) => console.error(`  ✗ ${p}`));
    process.exit(1);
  }
  console.log("\nDay 7 and diagnostic OK");
}

if (/validate-final\.ts$/.test(process.argv[1] ?? "")) main();
