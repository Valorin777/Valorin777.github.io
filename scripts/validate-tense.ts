/**
 * Validate one tense-reference file:  npx tsx scripts/validate-tense.ts present-perfect
 * (or --all). Runs the Zod schema plus the exercise lints used for lesson days, and checks
 * cross-links, ids and lengths. Prints a one-line summary per entry.
 */
import { TenseRefSchema, type TenseRef } from "../lib/content/schema";
import { TENSE_GROUP_OF, TENSE_IDS, type TenseId } from "../content/tenses/ids";
import { exerciseProblems } from "./check-content";

const MAX_EXAMPLE_CHARS = 140;

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

export function tenseProblems(t: TenseRef, id: string): string[] {
  const out: string[] = [];
  if (t.id !== id) out.push(`id "${t.id}" must equal the file name "${id}"`);
  const group = TENSE_GROUP_OF[id as TenseId];
  if (group && t.group !== group) out.push(`group must be "${group}"`);
  for (const v of t.versus) {
    if (!(TENSE_IDS as readonly string[]).includes(v.tense)) out.push(`versus.tense "${v.tense}" is not a reference id`);
    if (v.tense === t.id) out.push("versus points at itself");
  }
  const ids = t.exercises.map((e) => e.id);
  if (new Set(ids).size !== ids.length) out.push("exercise ids repeat");
  const types = new Set(t.exercises.map((e) => e.type));
  if (types.size < 3) out.push(`exercises use ${types.size} type(s); use at least 3 of choice, fill, errorTap, reorder`);
  for (const e of t.exercises) for (const p of exerciseProblems(e)) out.push(`exercise ${e.id}: ${p}`);
  const english = [
    ...t.examples.map((e) => e.en),
    ...t.uses.map((u) => u.example.en),
    ...t.versus.flatMap((v) => [v.a.en, v.b.en]),
    ...t.forms.map((f) => f.example),
    ...t.mistakes.map((m) => m.right),
  ];
  for (const s of english) {
    if (s.length > MAX_EXAMPLE_CHARS) out.push(`example too long (${s.length} chars): "${s.slice(0, 40)}…"`);
    if (/_{3,}/.test(s)) out.push(`example has a gap: "${s}"`);
    if (/[а-яё]/i.test(s)) out.push(`English example contains Cyrillic: "${s}"`);
  }
  for (const s of strings(t)) {
    if ((s.match(/\*\*/g) ?? []).length % 2) out.push(`unbalanced ** in "${s.slice(0, 50)}"`);
    if (/[—–]\s*$/.test(s)) out.push(`text ends with a dash: "${s.slice(-30)}"`);
  }
  for (const s of [t.idea, t.trick, ...t.uses.map((u) => u.ru), ...t.versus.map((v) => v.ru), ...t.mistakes.map((m) => m.why)]) {
    if (!/[а-яё]/i.test(s)) out.push(`Russian text expected: "${s.slice(0, 50)}"`);
  }
  return out;
}

export async function loadTense(id: string): Promise<unknown> {
  const mod = (await import(`../content/tenses/${id}.ts`)) as Record<string, unknown>;
  return mod.entry ?? (mod.default as Record<string, unknown> | undefined)?.entry;
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) throw new Error("usage: npx tsx scripts/validate-tense.ts <id>|--all");
  const ids = arg === "--all" ? [...TENSE_IDS] : [arg];
  let failed = 0;
  for (const id of ids) {
    let raw: unknown;
    try {
      raw = await loadTense(id);
    } catch (e) {
      console.error(`✗ ${id}: cannot load content/tenses/${id}.ts (${(e as Error).message.split("\n")[0]})`);
      failed++;
      continue;
    }
    if (!raw) {
      console.error(`✗ ${id}: content/tenses/${id}.ts must \`export const entry = { … } satisfies TenseRefInput\``);
      failed++;
      continue;
    }
    const parsed = TenseRefSchema.safeParse(raw);
    if (!parsed.success) {
      console.error(`✗ ${id}:\n` + parsed.error.issues.map((i) => `    ${i.path.join(".")}: ${i.message}`).join("\n"));
      failed++;
      continue;
    }
    const t = parsed.data;
    const problems = tenseProblems(t, id);
    if (problems.length) {
      console.error(`✗ ${id}:\n` + problems.map((p) => `    ${p}`).join("\n"));
      failed++;
      continue;
    }
    console.log(
      `✓ ${id.padEnd(28)} forms ${t.forms.length} · uses ${t.uses.length} · signals ${t.signals.length} · versus ${t.versus.length} · mistakes ${t.mistakes.length} · examples ${t.examples.length} · exercises ${t.exercises.length}`,
    );
  }
  if (failed) process.exit(1);
}

if (/validate-tense\.ts$/.test(process.argv[1] ?? "")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
