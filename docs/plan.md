# B2 Sprint — plan

## Hosting
Static export of Next.js (App Router) published to GitHub Pages at
`https://valorin777.github.io/b2/` (folder `b2/` in the `Valorin777.github.io` repo, the same
way `/vlados/` and `/sochi/` are published). GitHub Pages cannot run server code, so the
AI (Claude Haiku 5.5 through OpenRouter) lives in a small Cloudflare Worker (`worker/`, free
tier) that holds `OPENROUTER_API_KEY` as a secret, validates every payload with Zod and
rate-limits per device and IP. The browser never sees the key.

## Data model
Phase 1 keeps everything on the device (localStorage, one versioned document). Phase 2 mirrors
the same shapes into Firestore under `users/{uid}` so nothing in the UI changes.

| Path (Firestore, Phase 2)            | Local key (Phase 1)  | Shape                                                          |
| ------------------------------------ | -------------------- | -------------------------------------------------------------- |
| `users/{uid}`                        | `settings`           | theme, voice, speech rate, sound, haptics, Russian hints       |
| `users/{uid}/days/{n}`               | `days[n]`            | done steps, answers per exercise, started/completed, override  |
| `users/{uid}/meta/position`          | `position`           | `{ day, stepId }` — what "Continue" resumes                     |
| `users/{uid}/cards/{cardId}`         | `cards[id]`          | front, back, category, source, SM-2 state (ef, interval, reps, due) |
| `users/{uid}/errors/{key}`           | `errors[key]`        | category, prompt, wrong answer, right answer, count, last seen |
| `users/{uid}/meta/streak`            | `streak`             | current, best, last active day                                 |
| `explanations/{hash}` (server only)  | —                    | cached AI explanation for (exercise, answer)                   |

Content is not user data: it lives in typed files under `/content`, validated by Zod at build
time (`npm run content:check`) and in unit tests.

## Routes
| Route        | Job                                                           |
| ------------ | ------------------------------------------------------------- |
| `/`          | One "Continue" button that resumes exactly where you stopped  |
| `/day/[n]`   | Lesson player: Learn → Listen & speak → Review → Done         |
| `/review`    | Due flashcards (SM-2)                                          |
| `/settings`  | Theme, voice, speech rate, sound, haptics, reset              |

## Phases
1. Setup, design tokens and system, content schema, Day 1 end to end (theory, five exercise
   types, read aloud and speaking drill with speech recognition, flashcards with SM-2, local
   progress, deploy). **← this delivery**
2. Google sign-in, Firestore sync of progress, flashcards and error log, Top 10 mistakes page.
3. AI feedback through the worker, diagnostic, PWA and offline, AI voice coach.
4. Days 2–7 content, Day 7 test and report, polish, README.
