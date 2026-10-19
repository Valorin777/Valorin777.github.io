/**
 * End-to-end walk through Day 1 as a brand-new learner, in a real browser, against the static
 * build: Start → every step → Done. Answers come from the content (one deliberate mistake),
 * checks resume-after-reload, the review step, the error log → flashcard path and console errors.
 *
 *   npm run build && npx tsx scripts/e2e.ts [--url=https://valorin777.github.io/b2] [--width=390]
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { chromium, type Page } from "playwright";
import { getDay } from "../content/index";
import { buildSteps } from "../lib/steps";

const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "out");
const BASE = "/b2";
const argv = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=") as [string, string]));
const WIDTH = Number(argv.width ?? 390);

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".txt": "text/plain" };

function serve(): Promise<{ url: string; close: () => void }> {
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
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

const day = getDay(1)!;
const steps = buildSteps(day);
let checks = 0;
function ok(cond: unknown, msg: string) {
  checks++;
  if (!cond) throw new Error(`FAILED: ${msg}`);
}

async function currentTitle(page: Page) {
  return (await page.locator("main h1").first().textContent({ timeout: 4000 }).catch(() => ""))?.trim() ?? "";
}

async function stepId(page: Page): Promise<string> {
  return page.evaluate(() => JSON.parse(localStorage.getItem("b2sprint:v1") ?? "{}").position?.stepId ?? "");
}

async function main() {
  const local = argv.url ? null : await serve();
  const url = argv.url ?? local!.url;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: WIDTH, height: 844 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  try {
    await page.goto(url + "/", { waitUntil: "networkidle" });
    const start = page.getByRole("link", { name: /^Start/ }).first();
    await start.waitFor({ timeout: 5000 });
    ok(await start.isVisible(), "home shows Start");
    await start.click();
    await page.waitForURL(/\/check\/$/);
    // The quick check: answer the first two, then skip the rest.
    await page.keyboard.press("1");
    await page.waitForTimeout(450);
    await page.keyboard.press("2");
    await page.waitForTimeout(450);
    await page.getByRole("button", { name: "Skip" }).click();
    await page.waitForURL(/\/day\/1\/$/);
    ok(true, "quick check can be skipped into Day 1");

    let mistakeMade = false;
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      await page.waitForFunction((id) => JSON.parse(localStorage.getItem("b2sprint:v1") ?? "{}").position?.stepId === id, st.id, { timeout: 6000 });

      if (i === 10) {
        await page.reload({ waitUntil: "networkidle" });
        ok((await stepId(page)) === st.id, `resume after reload lands on ${st.id}`);
        await page.locator("main h1").first().waitFor();
      }

      switch (st.kind) {
        case "rule": {
          const card = day.topics.find((t) => t.id === st.topicId)!.rules[st.cardIndex];
          ok((await currentTitle(page)) === card.title, `rule title "${card.title}"`);
          for (let k = 0; k < card.steps.length; k++) await page.keyboard.press("Enter");
          break;
        }
        case "mistakes":
        case "ruNote":
        case "listen":
          await page.keyboard.press("Enter");
          break;
        case "exercise": {
          const ex = day.topics.find((t) => t.id === st.topicId)!.exercises[st.exerciseIndex];
          if (ex.type === "choice" || ex.type === "collocation") {
            const pick = !mistakeMade ? (ex.answer + 1) % ex.options.length : ex.answer;
            await page.keyboard.press(String(pick + 1));
            if (!mistakeMade) {
              mistakeMade = true;
              await page.getByText("Close. Here is the trick.").waitFor();
              ok(true, "wrong answer shows the trick");
              await page.keyboard.press("Enter");
            }
          } else if (ex.type === "fill") {
            await page.locator(`#fill-${ex.id}`).fill(ex.answers[0]);
            await page.keyboard.press("Enter");
          } else if (ex.type === "errorTap") {
            await page.locator('[aria-label="Words of the sentence"] button').nth(ex.wrong).click();
          } else if (ex.type === "reorder") {
            for (const w of ex.words) await page.getByRole("button", { name: `Add “${w}”` }).first().click();
            await page.getByRole("button", { name: "Check" }).click();
          }
          break;
        }
        case "speak":
          await page.keyboard.press("Enter"); // show the answer
          await page.getByRole("button", { name: "I said it" }).click();
          await page.keyboard.press("Enter");
          break;
        case "review": {
          await page.getByText("Today's cards").first().waitFor();
          for (let n = 0; n < 60; n++) {
            if (await page.getByRole("button", { name: "Finish the day" }).isVisible()) break;
            await page.getByRole("button", { name: "Show answer" }).click();
            await page.getByRole("button", { name: /^Good/ }).click();
          }
          await page.getByRole("button", { name: "Finish the day" }).click();
          break;
        }
        case "done":
          await page.getByText(/: done\./).waitFor();
          ok(true, "day complete screen");
          break;
      }
    }

    const state = await page.evaluate(() => JSON.parse(localStorage.getItem("b2sprint:v1") ?? "{}"));
    ok(state.days?.["1"]?.completedAt, "day 1 marked completed");
    ok(Object.keys(state.errors ?? {}).length >= 1, "the mistake is in the error log");
    ok(Object.keys(state.cards ?? {}).some((k: string) => k.startsWith("m:")), "the mistake became a flashcard");
    ok(Object.keys(state.cards ?? {}).filter((k: string) => k.startsWith("p:")).length === day.phrases.length, "all phrases became flashcards");
    ok(state.streak?.current === 1, "streak started");

    const nextDay = page.getByRole("link", { name: /Start Day 2/ });
    ok(await nextDay.isVisible(), "the done screen offers Day 2");
    await page.goto(url + "/", { waitUntil: "networkidle" });
    await page.getByText(/Day 1 is done\.|Day 2 is ready\./).first().waitFor();
    ok(true, "home shows the finished day");

    ok(errors.length === 0, `no console errors (${errors.join(" | ")})`);
    console.log(`E2E OK at ${WIDTH}px: ${checks} checks, ${steps.length} steps walked.`);
  } catch (e) {
    await page.screenshot({ path: join(ROOT, "shots", "e2e-failure.png") }).catch(() => {});
    console.error(e instanceof Error ? e.message : e, "\nlast step:", await stepId(page).catch(() => "?"), "\nerrors:", errors);
    process.exitCode = 1;
  } finally {
    await browser.close();
    local?.close();
  }
}

void main();
