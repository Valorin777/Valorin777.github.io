/**
 * Walks the whole tense reference in a browser: the list, every entry page, and every practice
 * exercise answered with its model answer through the real UI (so each one is answerable and
 * accepted), ending on "Clean run" each time.
 *   npm run build && npx tsx scripts/e2e-tenses.ts [--url=https://valorin777.github.io/b2] [--only=be-rule] [--port=3000]
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { chromium, type Page } from "playwright";
import { TENSES } from "../content/tenses/index";
import { tenseExerciseKey } from "../lib/tenses";
import type { Exercise, TenseRef } from "../lib/content/schema";

const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "out");
const BASE = "/b2";
const argv = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=") as [string, string]));
const WIDTH = Number(argv.width ?? 390);
const ONLY = argv.only ? new Set(argv.only.split(",")) : null;
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
}

async function answer(page: Page, t: TenseRef, ex: Exercise): Promise<void> {
  const id = tenseExerciseKey(t.id, ex.id);
  switch (ex.type) {
    case "choice":
    case "collocation":
      await page.keyboard.press(String(ex.answer + 1));
      break;
    case "fill":
      await page.locator(`#fill-${id}`).fill(ex.answers[0]!);
      await page.keyboard.press("Enter");
      break;
    case "errorTap":
      await page.locator('[aria-label="Words of the sentence"] button').nth(ex.wrong).click();
      break;
    case "reorder":
      for (const w of ex.words) await page.getByRole("button", { name: `Add “${w}”` }).first().click();
      await page.getByRole("button", { name: "Check" }).click();
      break;
  }
}

async function main() {
  const local = argv.url ? null : await serve();
  const url = argv.url ?? local!.url;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: WIDTH, height: 844 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  try {
    await page.goto(`${url}/tenses/`, { waitUntil: "networkidle" });
    ok((await page.locator("main h1").first().textContent())?.includes("All the tenses"), "the list opens");
    ok(await page.getByRole("link", { name: /Start here/ }).isVisible(), "the be-rule card is on top");
    const mapLinks = await page.locator('a[href*="/tenses/"]').count();
    ok(mapLinks >= TENSES.length, `every entry is linked from the list (${mapLinks})`);

    for (const t of TENSES) {
      if (ONLY && !ONLY.has(t.id)) continue;
      await page.goto(`${url}/tenses/${t.id}/`, { waitUntil: "networkidle" });
      await page.locator("main h1").first().waitFor();
      ok((await page.locator("main h1").first().textContent())?.trim() === t.name, `${t.id}: title`);
      for (const h of ["How to build it", "When to use it", "Signal words", "Don't mix it up", "Typical mistakes", "Examples"]) {
        ok(await page.getByRole("heading", { name: h }).count(), `${t.id}: section "${h}"`);
      }
      ok(await page.getByText("Фишка").count(), `${t.id}: the trick`);
      await page.getByRole("button", { name: /^Practise/ }).click();
      for (let i = 0; i < t.exercises.length; i++) {
        const ex = t.exercises[i]!;
        await page.getByText(`${i + 1} of ${t.exercises.length}`).waitFor({ timeout: 6000 });
        await answer(page, t, ex);
        // A right answer auto-advances; the last one lands on the summary.
        if (i + 1 < t.exercises.length) await page.getByText(`${i + 2} of ${t.exercises.length}`).waitFor({ timeout: 6000 });
      }
      await page.getByText("All right. Clean run.").waitFor({ timeout: 6000 });
      ok(true, `${t.id}: ${t.exercises.length} exercises accepted`);
      await page.getByRole("button", { name: "Back to the rule" }).click();
      await page.getByText(`${t.exercises.length} of ${t.exercises.length} done right so far`).waitFor({ timeout: 4000 });
      process.stdout.write(`✓ ${t.id}\n`);
    }
    ok(errors.length === 0, `no page errors: ${errors.join(" | ")}`);
    console.log(`E2E tenses OK at ${WIDTH}px: ${checks} checks.`);
  } finally {
    await browser.close();
    local?.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
