/**
 * Real-browser check of the coach's microphone: Chromium gets a WAV file as its microphone
 * (an answer with a long thinking pause in the middle), we tap the mic and watch the status
 * line until the learner's bubble appears. Needs a build with NEXT_PUBLIC_AI_URL and the
 * worker allowing http://127.0.0.1:3000.
 *   npx tsx scripts/mic-check.ts --wav=/path/answer.wav [--expect="kazan"] [--url=http://127.0.0.1:3000/b2]
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { chromium } from "playwright";

const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "out");
const BASE = "/b2";
const argv = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=") as [string, string]));
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".m4a": "audio/mp4", ".json": "application/json" };

async function main() {
  const wav = argv.wav;
  if (!wav || !existsSync(wav)) throw new Error("--wav=<file> is required");
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    let file = join(OUT, path.slice(BASE.length));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!path.startsWith(BASE) || !existsSync(file)) file = join(OUT, "404.html");
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((r) => server.listen(3000, "127.0.0.1", r));
  const browser = await chromium.launch({
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${wav}%noloop`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    localStorage.setItem("b2sprint:coach-text", "1");
  });
  const t0 = Date.now();
  const log = (m: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s  ${m}`);
  await page.goto(`${argv.url ?? "http://127.0.0.1:3000/b2"}/coach/`);
  await page.getByRole("button", { name: /Tense trainer/ }).click();
  // Cut the opener short and answer right away.
  await page.waitForTimeout(800);
  const mic = page.getByRole("button", { name: /Answer the coach|Stop listening|Done, send my answer/ });
  await mic.click();
  log("tapped the mic");
  const status = page.locator("p[aria-live=polite]").last();
  let last = "";
  const deadline = Date.now() + 60_000;
  let bubble = "";
  while (Date.now() < deadline) {
    const s = ((await status.textContent().catch(() => "")) ?? "").trim();
    const label = (await mic.getAttribute("aria-label").catch(() => "")) ?? "";
    const line = `${s} [${label}]`;
    if (line !== last) log(line);
    last = line;
    const users = page.locator("ol li.justify-self-end p.rounded-lg");
    if ((await users.count()) > 0) {
      bubble = ((await users.first().textContent()) ?? "").trim();
      break;
    }
    await page.waitForTimeout(100);
  }
  log(`learner bubble: "${bubble}"`);
  await browser.close();
  server.close();
  const expect = (argv.expect ?? "kazan").toLowerCase();
  if (!bubble.toLowerCase().includes(expect)) {
    console.error(`FAILED: the answer after the pause ("${expect}") was not heard`);
    process.exit(1);
  }
  console.log("mic check passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
