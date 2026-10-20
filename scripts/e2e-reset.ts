/**
 * Starting over in a real browser: Settings → start Day 1 over, then the whole course; checks the
 * saved state after each step and after reloads, and that tense practice (day 0) survives a reload.
 *   npm run build && npx tsx scripts/e2e-reset.ts --port=3000 [--url=https://valorin777.github.io/b2]
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { chromium, type Page } from "playwright";
import { getDay } from "../content/index";
import { TENSES } from "../content/tenses/index";
import { FINAL_DRAFT_KEY, STORAGE_KEY } from "../lib/constants";
import {
  addPhraseCards,
  completeStep,
  initialState,
  isDayUnlocked,
  recordAnswer,
  setDiagnostic,
  setFinalTest,
  setPosition,
  touch,
  touchStreak,
  type AnswerInput,
} from "../lib/progress";
import { buildSteps } from "../lib/steps";
import { tenseExerciseKey } from "../lib/tenses";
import type { AppState } from "../types/state";

const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "out");
const BASE = "/b2";
const argv = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=") as [string, string]));
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };

function serve(): Promise<{ url: string; close: () => void }> {
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    let file = join(OUT, path.slice(BASE.length));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!path.startsWith(BASE) || !existsSync(file)) file = join(OUT, "404.html");
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) =>
    server.listen(Number(argv.port ?? 0), "127.0.0.1", () => {
      const a = server.address();
      resolve({ url: `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}${BASE}`, close: () => server.close() });
    }),
  );
}

let checks = 0;
function ok(cond: unknown, msg: string): void {
  checks++;
  if (!cond) throw new Error(`FAILED: ${msg}`);
  console.log(`✓ ${msg}`);
}

const NOW = "2026-10-20T09:00:00.000Z";
const TODAY = "2026-10-20";
const answer = (extra: Partial<AnswerInput>): AnswerInput => ({
  day: 1,
  key: "x",
  correct: false,
  category: "be-verb",
  prompt: "p",
  given: "g",
  right: "r",
  rule: "rule",
  nowIso: NOW,
  today: TODAY,
  ...extra,
});

/** Halfway through the course: Days 1–2 started, mistakes, cards, a level check, Day 7 done, tense practice. */
function seeded(): AppState {
  const d1 = buildSteps(getDay(1)!);
  const d2 = buildSteps(getDay(2)!);
  let s = initialState();
  s = setDiagnostic(s, { completedAt: NOW, level: "B1", byCategory: {}, focus: ["perfect"] });
  for (let i = 0; i < 12; i++) s = completeStep(s, 1, d1[i]!.id, d1[i + 1]!.id, NOW);
  s = recordAnswer(s, answer({ key: "day1-mistake" }));
  s = addPhraseCards(s, 1, [{ en: "make a decision", ru: "принять решение", category: "collocations" }], TODAY, NOW);
  s = { ...s, days: { ...s.days, 1: { ...s.days[1]!, completedAt: NOW } } };
  for (let i = 0; i < 5; i++) s = completeStep(s, 2, d2[i]!.id, d2[i + 1]!.id, NOW);
  s = recordAnswer(s, answer({ day: 2, key: "day2-mistake", category: "perfect" }));
  s = setFinalTest(s, {
    completedAt: NOW,
    answers: {},
    part1: { correct: 1, total: 2 },
    part2: { correct: 1, total: 2 },
    byCategory: {},
    percent: 50,
    band: "Strong B1",
  });
  const t = TENSES[0]!;
  s = recordAnswer(s, answer({ day: 0, key: tenseExerciseKey(t.id, t.exercises[0]!.id), correct: true }));
  s = setPosition(s, 1, d1[12]!.id);
  s = touchStreak(s, TODAY);
  return touch(s, NOW);
}

async function saved(page: Page): Promise<AppState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), STORAGE_KEY);
}

async function main() {
  const local = argv.url ? null : await serve();
  const url = argv.url ?? local!.url;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    // Seed once (not an init script: it would run again after every reload).
    await page.goto(`${url}/settings/`, { waitUntil: "networkidle" });
    await page.evaluate(
      ([key, value, draftKey]) => {
        localStorage.setItem(key, value);
        localStorage.setItem(draftKey, JSON.stringify({ "p1-a:1": "despite" }));
      },
      [STORAGE_KEY, JSON.stringify(seeded()), FINAL_DRAFT_KEY] as const,
    );
    await page.reload({ waitUntil: "networkidle" });

    // Tense practice (day 0) used to vanish on reload.
    let s = await saved(page);
    ok(Object.keys(s.days[0]?.answers ?? {}).length === 1, "tense practice is still there after a reload");

    // Days with something to clear can be picked; the others cannot.
    for (const n of [1, 2, 7]) ok(await page.getByRole("button", { name: new RegExp(`^Day ${n}:`) }).isEnabled(), `Day ${n} can be started over`);
    for (const n of [3, 4, 5, 6]) ok(await page.getByRole("button", { name: new RegExp(`^Day ${n}:`) }).isDisabled(), `Day ${n} has nothing to clear`);

    // Start Day 1 over.
    await page.getByRole("button", { name: /^Day 1:/ }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    s = await saved(page);
    ok(s.days[1]?.doneSteps.length === 12, "Cancel keeps Day 1");
    await page.getByRole("button", { name: /^Day 1:/ }).click();
    await page.getByRole("button", { name: "Start Day 1 over" }).click();
    await page.getByText("Day 1 is fresh.").waitFor();
    s = await saved(page);
    ok(s.days[1] === undefined, "Day 1 progress is cleared");
    ok(!s.errors["day1-mistake"] && !Object.values(s.cards).some((c) => c.day === 1), "Day 1 mistakes and cards are cleared");
    ok(s.days[2]?.doneSteps.length === 5 && s.errors["day2-mistake"], "Day 2 is untouched");
    ok(isDayUnlocked(s, 2), "Day 2 stays open");
    ok(s.position === null, "the saved position inside Day 1 is gone");
    ok(typeof s.dayResets?.[1] === "string", "the day reset time is saved");
    ok(s.diagnostic !== null && s.finalTest !== null, "the level check and Day 7 stay");

    await page.reload({ waitUntil: "networkidle" });
    s = await saved(page);
    ok(s.days[1] === undefined && typeof s.dayResets?.[1] === "string", "Day 1 stays fresh after a reload");

    // Day 1 opens at its very first step.
    await page.getByRole("button", { name: /^Day 7:/ }).waitFor();
    await page.goto(`${url}/day/1/`, { waitUntil: "networkidle" });
    const first = buildSteps(getDay(1)!)[0]!;
    await page.waitForFunction(
      ([key, id]) => JSON.parse(localStorage.getItem(key) ?? "{}").position?.stepId === id,
      [STORAGE_KEY, first.id] as const,
      { timeout: 6000 },
    );
    ok(true, `Day 1 opens at its first step (${first.id})`);

    // A lesson open in another tab starts from scratch when its day is started over elsewhere.
    const d2 = buildSteps(getDay(2)!);
    const lesson = await context.newPage();
    lesson.on("pageerror", (e) => errors.push(e.message));
    await lesson.goto(`${url}/day/2/`, { waitUntil: "networkidle" });
    await lesson.waitForFunction(
      ([key, id]) => JSON.parse(localStorage.getItem(key) ?? "{}").position?.stepId === id,
      [STORAGE_KEY, d2[5]!.id] as const,
      { timeout: 6000 },
    );
    ok(true, "the other tab resumes Day 2 where it stopped");
    await page.goto(`${url}/settings/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^Day 2:/ }).click();
    await page.getByRole("button", { name: "Start Day 2 over" }).click();
    await lesson.waitForFunction(
      ([key, id]) => {
        const st = JSON.parse(localStorage.getItem(key) ?? "{}");
        return st.position?.stepId === id && (st.days?.[2]?.doneSteps?.length ?? 0) === 0;
      },
      [STORAGE_KEY, d2[0]!.id] as const,
      { timeout: 6000 },
    );
    ok(true, "the open Day 2 tab jumps back to its first step and keeps no old steps");
    await lesson.close();

    // Start the whole course over.
    await page.goto(`${url}/settings/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Start over…" }).click();
    await page.getByRole("button", { name: "Keep progress" }).click();
    ok((await saved(page)).diagnostic !== null, "Keep progress keeps everything");
    await page.getByRole("button", { name: "Start over…" }).click();
    await page.getByRole("button", { name: "Clear everything" }).click();
    await page.waitForURL(/\/b2\/$/, { timeout: 6000 });
    s = await saved(page);
    ok(
      Object.keys(s.days).length === 0 &&
        Object.keys(s.cards).length === 0 &&
        Object.keys(s.errors).length === 0 &&
        s.diagnostic === null &&
        s.finalTest === null &&
        s.position === null &&
        s.streak.current === 0,
      "everything is cleared, tense practice included",
    );
    ok(typeof s.resetAt === "string", "the reset time is saved");
    ok((await page.evaluate((k) => localStorage.getItem(k), FINAL_DRAFT_KEY)) === null, "the Day 7 draft is gone");
    await page.getByRole("link", { name: /^Start/ }).first().waitFor({ timeout: 6000 });
    ok(true, "home shows the first-visit start");

    await page.reload({ waitUntil: "networkidle" });
    s = await saved(page);
    ok(Object.keys(s.days).length === 0 && typeof s.resetAt === "string", "still empty after a reload");
    ok(errors.length === 0, `no page errors ${errors.join(" | ")}`);
    console.log(`E2E reset OK: ${checks} checks.`);
  } finally {
    await browser.close();
    local?.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
