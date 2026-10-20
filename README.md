# B2 Sprint

Seven calm days from B1 to B2+ for a Russian-speaking learner: theory one point at a time,
tap-first exercises, read-aloud with speech recognition, a "say it in English" drill,
SM-2 flashcards, a voice coach and a tense reference (every tense with a timeline, forms,
uses, typical Russian-speaker mistakes and practice).

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
npm run build && npx tsx scripts/mic-check.ts --wav=answer.wav   # coach mic with a WAV as the microphone
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

## Running costs

Measured 20.10.2026 with the real prompts (OpenRouter prices):

| What | Model | Per call |
| --- | --- | --- |
| Coach reply | Claude Haiku 5.5 | $0.0003 |
| Coach grammar check (correction + tip) | Claude Sonnet 5.5 | $0.010 (grows with the conversation, up to ~$0.013) |
| Coach voice | gpt-audio-mini (Marin) | $0.0005 |
| Mistake explanation | Claude Haiku 5.5 | $0.0001, cached per exercise and answer |
| Translation | Claude Haiku 5.5 | $0.0001, cached |
| Lessons, tenses, Day 7, cards | prerecorded audio | $0 |
| Speech recognition | Whisper on Cloudflare Workers AI | Cloudflare free tier, not OpenRouter |

One coach turn is about $0.011. A week: without the coach under $0.05; with the coach 15 min a day
about $2, 30 min about $4, an hour about $8. Moving the grammar check to Haiku (`REVIEW_MODEL` in
`worker/wrangler.jsonc`) makes the coach about ten times cheaper, with less precise corrections.

## Adding a tense entry

Write `content/tenses/<id>.ts` (`export const entry = { … } satisfies TenseRefInput`), add the id to
`content/tenses/ids.ts` and `content/tenses/index.ts`, then `npx tsx scripts/validate-tense.ts <id>`.
Record its audio with `scripts/build-audio.ts` (only new lines are recorded).

## Layout

`app/` routes · `components/` UI · `lib/` engine (answers, SM-2, steps, progress, speech, AI client)
· `content/` lessons · `hooks/` · `types/` · `docs/` plan, screen specs, design decisions ·
`worker/` AI server · `scripts/` checks, screenshots, deploy.
