# B2 Sprint

Seven calm days from B1 to B2+ for a Russian-speaking learner: theory one point at a time,
tap-first exercises, read-aloud with speech recognition, a "say it in English" drill,
SM-2 flashcards and a voice coach.

Live: https://valorin777.github.io/b2/ · AI worker: https://b2-sprint-ai.b2-sprint-ai.workers.dev

## Stack

Next.js 16 (App Router, static export) · TypeScript strict · Tailwind 4 · Zod · Motion ·
Web Speech API · Cloudflare Worker + OpenRouter (Claude Haiku 5.5) for AI.

## Setup

```bash
npm install
npm run dev            # http://localhost:3000/b2/
```

Set `NEXT_PUBLIC_BASE_PATH=""` to serve from the root instead of `/b2`.

## Environment variables

| Variable               | Where                 | What                                               |
| ---------------------- | --------------------- | -------------------------------------------------- |
| `NEXT_PUBLIC_BASE_PATH`| build                 | URL prefix, default `/b2` (GitHub Pages folder)    |
| `NEXT_PUBLIC_AI_URL`   | build                 | AI worker URL; empty = AI off (deploy sets the live worker) |
| `OPENROUTER_API_KEY`   | worker secret         | never in the client or the repo (see `worker/`)    |

## Checks

```bash
npm run check          # eslint + tsc + vitest + content validation
npm run build && npx tsx scripts/e2e.ts            # walks all of Day 1 in a browser
npm run build && npm run shots                     # screenshots 390/768/1440 × light/dark → shots/
```

## Deploy

```bash
npm run deploy         # builds, replaces only b2/ in Valorin777.github.io, pushes, waits until live
```

AI worker: see `worker/README.md` (`npx wrangler deploy`, secret `OPENROUTER_API_KEY`).

## Adding a lesson

1. Create `content/days/day-N.ts` exporting `export const dayN = { … } satisfies DayInput`
   (schema and field docs: `lib/content/schema.ts`; Day 1 is the reference).
2. Add it to `DAYS` in `content/index.ts` and set `available: true` for that day in
   `content/days/meta.ts` (titles must match).
3. `npm run content:check` validates the schema plus integrity lints (one wrong word per
   error-tap item, alt orders use the same words, etc.). Fix until it prints "Content OK".
4. The player builds the steps automatically: rules → mistakes → note for Russian speakers →
   exercises per topic, then listen & speak, then review.

## Layout

`app/` routes · `components/` UI · `lib/` engine (answers, SM-2, steps, progress, speech, AI client)
· `content/` lessons · `hooks/` · `types/` · `docs/` plan, screen specs, design decisions ·
`worker/` AI server · `scripts/` checks, screenshots, deploy.
