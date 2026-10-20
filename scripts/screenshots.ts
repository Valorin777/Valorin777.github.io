/**
 * Screenshots of key screens at 390 / 768 / 1440 px in light and dark, plus a contact sheet
 * per size and theme for quick review.
 *
 *   npm run build && npx tsx scripts/screenshots.ts [--only=home,rule] [--sizes=390] [--themes=light]
 *
 * Serves out/ under /b2/ on a local port, seeds localStorage with a realistic state per screen,
 * and writes PNGs to shots/ (gitignored).
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { chromium, type Page } from "playwright";
import { getDay, getDiagnostic, getFinal } from "../content/index";
import { initialState, recordAnswer, completeStep, addPhraseCards, setDiagnostic, setFinalTest } from "../lib/progress";
import { scoreDiagnostic } from "../lib/diagnostic";
import { gapKey, scoreFinalTest } from "../lib/finalTest";
import { readableExercise } from "../lib/answers";
import { buildSteps, type Step } from "../lib/steps";
import type { AppState } from "../types/state";

const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "out");
const SHOTS = join(ROOT, "shots");
const BASE = "/b2";
const KEY = "b2sprint:v1";

const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);
const SIZES = (argv.sizes ?? "390,768,1440").split(",").map(Number);
const THEMES = (argv.themes ?? "light,dark").split(",") as ("light" | "dark")[];
const ONLY = argv.only ? new Set(argv.only.split(",")) : null;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
  ".webmanifest": "application/manifest+json",
};

function serve(): Promise<{ url: string; close: () => void }> {
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (!path.startsWith(BASE)) {
      res.writeHead(404).end();
      return;
    }
    let file = join(OUT, path.slice(BASE.length));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) file = join(OUT, "404.html");
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) =>
    server.listen(Number(argv.port ?? 0), "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ url: `http://127.0.0.1:${port}${BASE}`, close: () => server.close() });
    }),
  );
}

const day = getDay(1);
if (!day) throw new Error("Day 1 content missing");
const steps = buildSteps(day);
const NOW = new Date().toISOString();
const TODAY = NOW.slice(0, 10);

function stateAt(stepIndex: number, opts: { answerAll?: boolean; mistakes?: number } = {}): AppState {
  let s = initialState();
  s = { ...s, settings: { ...s.settings } };
  for (let i = 0; i < stepIndex; i++) {
    const st = steps[i];
    s = completeStep(s, 1, st.id, steps[i + 1]?.id ?? null, NOW);
    if (st.kind === "exercise" && (opts.answerAll || (opts.mistakes ?? 0) > 0)) {
      const topic = day!.topics.find((t) => t.id === st.topicId)!;
      const ex = topic.exercises[st.exerciseIndex];
      const r = readableExercise(ex);
      const wrong = (opts.mistakes ?? 0) > 0 && i % 4 === 0;
      s = recordAnswer(s, {
        day: 1,
        key: ex.id,
        correct: !wrong,
        category: topic.category,
        prompt: r.prompt,
        given: wrong ? "is started" : r.answer,
        right: r.answer,
        rule: ex.rule,
        nowIso: NOW,
        today: TODAY,
      });
    }
  }
  s = { ...s, position: { day: 1, stepId: steps[stepIndex].id }, streak: { current: 3, best: 3, lastDay: TODAY } };
  s.days[1] = { ...s.days[1], seconds: 23 * 60 };
  return s;
}

const idx = (pred: (s: Step) => boolean) => steps.findIndex(pred);
const firstOf = (kind: Step["kind"], type?: string) =>
  idx((s) => {
    if (s.kind !== kind) return false;
    if (!type || s.kind !== "exercise") return true;
    const t = day!.topics.find((tp) => tp.id === s.topicId)!;
    return t.exercises[s.exerciseIndex].type === type;
  });

interface Shot {
  name: string;
  path: string;
  state: AppState | null;
  act?: (page: Page) => Promise<void>;
}

function reviewStateFor(): AppState {
  return reviewState;
}
const reviewState = (() => {
  let s = stateAt(idx((st) => st.kind === "review"), { mistakes: 1 });
  s = addPhraseCards(s, 1, day.phrases, TODAY, NOW);
  return s;
})();

const final = getFinal()!;
function finalState(stepId: string, withResult = false): AppState {
  let s = stateAt(steps.length - 1, { answerAll: true, mistakes: 1 });
  for (const n of [1, 2, 3, 4, 5, 6]) s = { ...s, days: { ...s.days, [n]: { ...(s.days[n] ?? { doneSteps: [], answers: {}, seconds: 0 }), completedAt: NOW } } };
  s = { ...s, position: { day: 7, stepId } };
  if (withResult) {
    const answers: Record<string, string | number> = {};
    final.part1.forEach((t) => t.gaps.forEach((g, i) => (answers[gapKey(t.id, i + 1)] = i % 3 === 0 ? (g.answer + 1) % 4 : g.answer)));
    final.part2.forEach((t) => t.gaps.forEach((g, i) => (answers[gapKey(t.id, i + 1)] = i % 4 === 0 ? "xx" : g.answers[0])));
    s = setFinalTest(s, scoreFinalTest(final, answers, NOW));
    s = { ...s, days: { ...s.days, 7: { doneSteps: ["done", "report"], answers: {}, seconds: 1500, completedAt: NOW } } };
  }
  return s;
}
const diag = getDiagnostic();
const diagState = setDiagnostic(stateAt(0), scoreDiagnostic(diag, Object.fromEntries(diag.map((d, i) => [d.id, i % 3 === 0 ? (d.answer + 1) % d.options.length : d.answer])), NOW));

const SCREENS: Shot[] = [
  { name: "check", path: "/check/", state: null },
  { name: "check-result", path: "/check/", state: diagState },
  { name: "mistakes-page", path: "/mistakes/", state: reviewStateFor() },
  { name: "drill", path: "/drill/", state: reviewStateFor() },
  { name: "translate", path: "/translate/", state: stateAt(3) },
  { name: "final-intro", path: "/day/7/", state: finalState("intro") },
  { name: "final-p1", path: "/day/7/", state: finalState(`p1:${final.part1[0].id}`), act: async (p) => { await p.keyboard.press("2"); await p.keyboard.press("3"); } },
  { name: "final-p2", path: "/day/7/", state: finalState(`p2:${final.part2[0].id}`) },
  { name: "final-report", path: "/day/7/", state: finalState("report", true) },
  { name: "day2-rule", path: "/day/2/", state: (() => { const s = finalState("intro"); return { ...s, position: { day: 2, stepId: "zero-first:rule:0" } }; })() },
  { name: "home-first", path: "/", state: null },
  { name: "home-progress", path: "/", state: stateAt(Math.floor(steps.length * 0.35), { mistakes: 1 }) },
  { name: "rule", path: "/day/1/", state: stateAt(0), act: async (p) => { await p.keyboard.press("Enter"); await p.keyboard.press("Enter"); } },
  { name: "mistakes", path: "/day/1/", state: stateAt(firstOf("mistakes")) },
  { name: "ru-note", path: "/day/1/", state: stateAt(firstOf("ruNote")) },
  { name: "choice", path: "/day/1/", state: stateAt(firstOf("exercise", "choice")) },
  {
    name: "choice-wrong",
    path: "/day/1/",
    state: stateAt(firstOf("exercise", "choice")),
    act: async (p) => {
      const st = steps[firstOf("exercise", "choice")];
      if (st.kind !== "exercise") return;
      const ex = day.topics.find((t) => t.id === st.topicId)!.exercises[st.exerciseIndex];
      if (ex.type !== "choice") return;
      const wrong = ex.answer === 0 ? 1 : 0;
      await p.keyboard.press(String(wrong + 1));
    },
  },
  { name: "fill", path: "/day/1/", state: stateAt(firstOf("exercise", "fill")) },
  { name: "error-tap", path: "/day/1/", state: stateAt(firstOf("exercise", "errorTap")) },
  {
    name: "reorder",
    path: "/day/1/",
    state: stateAt(firstOf("exercise", "reorder")),
    act: async (p) => {
      const bank = p.locator('[aria-label="Words"] button');
      for (let i = 0; i < 2 && (await bank.count()) > 0; i++) await bank.first().click();
    },
  },
  { name: "listen", path: "/day/1/", state: stateAt(firstOf("listen")) },
  { name: "speak", path: "/day/1/", state: stateAt(firstOf("speak")) },
  { name: "review-step", path: "/day/1/", state: reviewState },
  {
    name: "review-flipped",
    path: "/review/",
    state: reviewState,
    act: async (p) => {
      await p.getByRole("button", { name: "Show answer" }).click();
    },
  },
  { name: "done", path: "/day/1/", state: stateAt(steps.length - 1, { answerAll: true, mistakes: 1 }) },
  { name: "settings", path: "/settings/", state: stateAt(3) },
  { name: "coach", path: "/coach/", state: stateAt(3) },
  {
    name: "settings-reset",
    path: "/settings/",
    state: stateAt(3),
    act: async (p) => {
      await p.getByText("Start a day over").scrollIntoViewIfNeeded();
      await p.getByRole("button", { name: /^Day 1:/ }).click();
      await p.getByRole("button", { name: "Start over…" }).scrollIntoViewIfNeeded();
    },
  },
  { name: "tenses", path: "/tenses/", state: stateAt(3) },
  { name: "tense", path: "/tenses/present-perfect/", state: stateAt(3) },
  {
    name: "tense-uses",
    path: "/tenses/present-perfect/",
    state: stateAt(3),
    act: async (p) => {
      await p.getByRole("heading", { name: "When to use it" }).scrollIntoViewIfNeeded();
      await p.evaluate(() => window.scrollBy(0, -80));
    },
  },
  {
    name: "tense-versus",
    path: "/tenses/be-rule/",
    state: stateAt(3),
    act: async (p) => {
      await p.getByRole("heading", { name: "Don't mix it up" }).scrollIntoViewIfNeeded();
      await p.evaluate(() => window.scrollBy(0, -80));
    },
  },
  {
    name: "tense-practice",
    path: "/tenses/past-perfect/",
    state: stateAt(3),
    act: async (p) => {
      await p.getByRole("button", { name: /Practise/ }).click();
    },
  },
  { name: "not-found", path: "/nowhere/", state: null },
];

async function main() {
  if (!existsSync(join(OUT, "index.html"))) throw new Error("Run `npm run build` first");
  mkdirSync(SHOTS, { recursive: true });
  const { url, close } = await serve();
  const browser = await chromium.launch();
  const sheets: Record<string, string[]> = {};
  try {
    for (const theme of THEMES) {
      for (const width of SIZES) {
        const height = width < 500 ? 844 : width < 1000 ? 1024 : 900;
        const context = await browser.newContext({
          viewport: { width, height },
          deviceScaleFactor: width < 500 ? 3 : 2,
          colorScheme: theme,
          reducedMotion: "reduce",
          hasTouch: width < 1000,
          isMobile: width < 500,
        });
        const sheetKey = `${theme}-${width}`;
        sheets[sheetKey] = [];
        for (const shot of SCREENS) {
          if (ONLY && !ONLY.has(shot.name)) continue;
          const page = await context.newPage();
          const errors: string[] = [];
          page.on("pageerror", (e) => errors.push(e.message));
          page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
          await page.addInitScript(
            ([key, value]) => {
              if (value === null) window.localStorage.removeItem(key as string);
              else window.localStorage.setItem(key as string, value as string);
            },
            [KEY, shot.state ? JSON.stringify(shot.state) : null] as const,
          );
          await page.goto(url + shot.path, { waitUntil: "networkidle" });
          await page.waitForTimeout(400);
          if (shot.act) {
            await shot.act(page);
            await page.waitForTimeout(500);
          }
          const file = join(SHOTS, `${shot.name}-${theme}-${width}.png`);
          await page.screenshot({ path: file, fullPage: false });
          sheets[sheetKey].push(file);
          if (errors.length) console.log(`! ${shot.name} ${theme} ${width}: ${errors.join(" | ")}`);
          await page.close();
        }
        await context.close();
      }
    }

    // Contact sheets: one image per theme and size.
    for (const [key, files] of Object.entries(sheets)) {
      if (!files.length) continue;
      const width = Number(key.split("-")[1]);
      const cols = width < 500 ? 6 : width < 1000 ? 4 : 3;
      const cell = width < 500 ? 300 : width < 1000 ? 420 : 560;
      const html = `<html><body style="margin:0;background:#888;display:grid;grid-template-columns:repeat(${cols},${cell}px);gap:8px;padding:8px;font:12px sans-serif">${files
        .map(
          (f) =>
            `<figure style="margin:0"><img style="width:${cell}px;display:block" src="data:image/png;base64,${readFileSync(f).toString("base64")}"><figcaption style="color:#fff">${f.split("/").pop()}</figcaption></figure>`,
        )
        .join("")}</body></html>`;
      const sheetFile = join(SHOTS, `sheet-${key}.html`);
      writeFileSync(sheetFile, html);
      const page = await browser.newPage({ viewport: { width: cols * (cell + 8) + 8, height: 600 } });
      await page.goto(`file://${sheetFile}`);
      await page.screenshot({ path: join(SHOTS, `sheet-${key}.png`), fullPage: true });
      await page.close();
    }
    console.log(`screenshots in ${SHOTS}`);
  } finally {
    await browser.close();
    close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
