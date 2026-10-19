#!/usr/bin/env node
// Publishes the static export to GitHub Pages: https://valorin777.github.io/b2/
//
//   npm run deploy              build, copy into b2/, commit, push, wait until Pages serves it
//   npm run deploy -- --no-wait push without waiting
//   npm run deploy -- --dry-run build and stage, but do not commit or push
//
// 1. `next build` (output: "export", basePath "/b2") → out/
// 2. Clone or fast-forward git@github.com:Valorin777/Valorin777.github.io.git into .pages/ (gitignored)
// 3. Replace ONLY the b2/ folder. Refuses to commit if anything outside b2/ changed —
//    the rest of that repo (vlados, sochi, Okoshko pages) belongs to other projects.
// 4. Commit and push over SSH.
// 5. Poll the live URL until the new build id is served (≤ 3 min).
//
// macOS note: git needs DEVELOPER_DIR=/Library/Developer/CommandLineTools while the Xcode
// licence is not accepted; the script sets it when that folder exists.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "git@github.com:Valorin777/Valorin777.github.io.git";
const BRANCH = "main";
const PAGES = join(ROOT, ".pages");
const SUB = "b2";
const OUT = join(ROOT, "out");
const LIVE = "https://valorin777.github.io/b2/";
// The AI worker (worker/); its URL is public, the OpenRouter key stays a worker secret.
const AI_URL = "https://b2-sprint-ai.b2-sprint-ai.workers.dev";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const wait = !args.has("--no-wait") && !dryRun;
const env = { ...process.env };
if (!env.DEVELOPER_DIR && existsSync("/Library/Developer/CommandLineTools")) {
  env.DEVELOPER_DIR = "/Library/Developer/CommandLineTools";
}

const say = (m) => console.log(`deploy: ${m}`);

function sh(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, {
    stdio: opts.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
    cwd: opts.cwd ?? ROOT,
    env: { ...env, ...(opts.env ?? {}) },
  });
  if (r.status !== 0) {
    const err = opts.capture ? `\n${r.stderr || r.stdout}` : "";
    throw new Error(`${cmd} ${argv.join(" ")} failed (${r.status})${err}`);
  }
  return (r.stdout ?? "").trim();
}
const git = (argv, cwd = PAGES, capture = true) => sh("git", argv, { cwd, capture });

// ---------------------------------------------------------------- 1. build
say("building…");
sh(process.execPath, [join(ROOT, "node_modules", "next", "dist", "bin", "next"), "build"], {
  env: { NEXT_PUBLIC_BASE_PATH: "/b2", NEXT_PUBLIC_AI_URL: process.env.NEXT_PUBLIC_AI_URL ?? AI_URL },
});
sh(process.execPath, [join(ROOT, "scripts", "build-sw.mjs")], { env: { NEXT_PUBLIC_BASE_PATH: "/b2" } });
const html = readFileSync(join(OUT, "index.html"), "utf8");
const stamp = new Date().toISOString();
if (!html.includes("/b2/_next/")) throw new Error("out/index.html does not reference /b2/_next/ — wrong basePath?");
writeFileSync(join(OUT, "version.txt"), `${stamp}\n`);

// ---------------------------------------------------------------- 2. clone / update
if (!existsSync(join(PAGES, ".git"))) {
  say(`cloning ${REPO} → .pages`);
  mkdirSync(PAGES, { recursive: true });
  sh("git", ["clone", "--depth", "20", "--branch", BRANCH, REPO, PAGES]);
} else {
  const left = git(["status", "--porcelain"]).split("\n").filter(Boolean);
  if (left.some((l) => !l.slice(3).replace(/^"/, "").startsWith(`${SUB}/`))) {
    throw new Error(".pages has uncommitted changes outside b2/ — look at them (git -C .pages status) first");
  }
  if (left.length) {
    git(["reset", "--quiet", "--", SUB]);
    git(["checkout", "--quiet", "--", "."]);
    git(["clean", "-fdq", "--", SUB]);
  }
  say("updating .pages");
  git(["checkout", BRANCH]);
  git(["pull", "--ff-only", "origin", BRANCH]);
}

// ---------------------------------------------------------------- 3. replace only b2/
rmSync(join(PAGES, SUB), { recursive: true, force: true });
cpSync(OUT, join(PAGES, SUB), { recursive: true });
git(["add", "--all", "--", SUB]);
const changed = git(["status", "--porcelain"]).split("\n").filter(Boolean);
const outside = changed.filter((l) => !l.slice(3).replace(/^"/, "").startsWith(`${SUB}/`));
if (outside.length) throw new Error(`refusing to deploy: changes outside ${SUB}/:\n${outside.join("\n")}`);

if (changed.length === 0) {
  say("nothing changed in b2/ — already live");
} else if (dryRun) {
  say(`dry run: ${changed.length} staged changes in .pages/${SUB} (not committed)`);
} else {
  // ---------------------------------------------------------------- 4. commit + push
  const msg = `Deploy b2 ${stamp}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n`;
  git(["-c", "user.name=Valorin777", "-c", "user.email=valeratcharygin@gmail.com", "commit", "--quiet", "-m", msg]);
  say(`committed ${changed.length} changes; pushing…`);
  git(["push", "--quiet", "origin", BRANCH], PAGES, false);
  say(`pushed ${git(["rev-parse", "--short", "HEAD"])}`);
}

// ---------------------------------------------------------------- 5. wait for Pages
if (wait) {
  say(`waiting for ${LIVE}version.txt to show ${stamp} (Pages usually takes 30–90 s)…`);
  const t0 = Date.now();
  let ok = false;
  while (Date.now() - t0 < 180_000) {
    try {
      const r = await fetch(`${LIVE}version.txt?cb=${Date.now()}`, { cache: "no-store" });
      if (r.ok && (await r.text()).includes(stamp)) {
        ok = true;
        break;
      }
    } catch {
      // network hiccup: keep polling
    }
    await new Promise((res) => setTimeout(res, 8000));
  }
  const s = Math.round((Date.now() - t0) / 1000);
  if (!ok) {
    say(`not live after ${s} s — Pages may still be building; check ${LIVE}version.txt in a minute`);
    process.exit(2);
  }
  say(`live after ${s} s: ${LIVE}`);
}
