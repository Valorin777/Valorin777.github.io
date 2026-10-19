/**
 * Validate one lesson day file before it is wired into content/index.ts.
 *   npx tsx scripts/validate-day.ts 3
 * Runs the Zod schema and every content lint except the meta check, then prints the summary.
 */
import { DaySchema, type Day } from "../lib/content/schema";
import { LINTS, summarize } from "./check-content";

async function main() {
  const n = Number(process.argv[2]);
  if (!Number.isInteger(n) || n < 1 || n > 6) throw new Error("usage: npx tsx scripts/validate-day.ts <1-6>");
  const mod = (await import(`../content/days/day-${n}.ts`)) as Record<string, unknown>;
  const raw = mod[`day${n}`] ?? (mod.default as Record<string, unknown> | undefined)?.[`day${n}`];
  if (!raw) throw new Error(`content/days/day-${n}.ts must export const day${n}`);
  const parsed = DaySchema.safeParse(raw);
  if (!parsed.success) {
    console.error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"));
    process.exit(1);
  }
  const day: Day = parsed.data;
  const problems = Object.entries(LINTS)
    .filter(([name]) => !/meta/i.test(name))
    .flatMap(([, lint]) => lint([day], []));
  console.log(summarize([day]));
  if (problems.length) {
    for (const p of problems) console.error(`✗ ${p.where}: ${p.message}`);
    process.exit(1);
  }
  console.log(`Day ${n} OK`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
