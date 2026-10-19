# b2-sprint-ai

A small Cloudflare Worker that gives B2 Sprint its AI features. The app itself is a static site
on GitHub Pages, which cannot keep secrets, so the browser calls this worker and the worker calls
Claude through [OpenRouter](https://openrouter.ai). The OpenRouter key lives only in the worker as
a secret: it never reaches the browser or the repository.

## Endpoints

| Method + path   | Body                                                                                          | Response                                       |
| --------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `GET /health`   | none                                                                                          | `{ ok: true, model }`                          |
| `POST /explain` | `{ exerciseId, task, given, right, rule, category, lang: "en" \| "ru" }`                      | `{ text, cached }`                             |
| `POST /coach`   | `{ history: [{ role: "user" \| "assistant", text }] (1–16, last is "user"), scenario, focus[], level: "B1" \| "B2" }` | `{ reply, correction: { wrong, right, why } \| null, ended }` |

- `/explain`: one or two calm sentences on why the learner's answer does not fit and what the
  rule is (English or Russian, at most about 45 words, `**bold**` for the key form). Answers are
  cached for 30 days, keyed by SHA-256 of model + exercise id + normalized answer + language,
  so the same mistake costs one model call.
- `/coach`: the spoken-practice partner. It replies in 1–3 short sentences, asks one follow-up
  question and returns at most one correction of the learner's last message. A correction is
  dropped if it quotes words the learner did not say. With 16 turns in the history, `ended` is
  true and the reply wraps the session up.

Errors are JSON `{ error }`: `400 invalid`, `403 forbidden` (origin not allowed),
`413 too-large`, `429 rate-limit`, `502 upstream` (OpenRouter failed or timed out after 15 s;
no details are passed on), `503 unavailable` (rate limiter binding missing).

## Protection

- **CORS:** only origins listed in `ALLOWED_ORIGINS` get `Access-Control-Allow-Origin`, and
  POSTs from any other origin (or with no origin) get 403. Preflights are cached for a day.
- **Device id:** every POST needs an `X-Device-Id` header (UUID-like, at most 64 characters).
- **Rate limit:** the `LIMITER` binding allows 30 requests a minute per device + IP, and the same
  binding is checked again with the key `ip:<IP>`, so one IP cannot get around it by rotating
  device ids. The limiter fails closed.
- **Payloads:** bodies over 8 KB are refused before parsing; every field is validated by Zod with
  length caps; unknown fields are rejected.
- **Logs:** only the route and the upstream status. The key, prompts and the learner's text are
  never logged.

## Set up and deploy

```bash
cd worker
npm install
npx wrangler login                          # once, opens the browser
npx wrangler secret put OPENROUTER_API_KEY  # paste the key when asked
npx wrangler deploy
```

`wrangler deploy` prints the worker URL, for example `https://b2-sprint-ai.<account>.workers.dev`.
Build the app with that URL so the client can find it:

```bash
NEXT_PUBLIC_AI_URL=https://b2-sprint-ai.<account>.workers.dev npm run build
```

Without `NEXT_PUBLIC_AI_URL` the app simply hides the AI features.

Check it: `curl https://b2-sprint-ai.<account>.workers.dev/health`.

The edge cache (`caches.default`) is fully functional when the worker runs on a custom domain;
on a `*.workers.dev` URL Cloudflare may not store anything. Nothing breaks either way, and the
browser also keeps its own cache of explanations.

## Local development

```bash
cd worker
cp .dev.vars.example .dev.vars   # then put the real key into .dev.vars (it is git-ignored)
npx wrangler dev                 # http://localhost:8787
```

Run the app with `NEXT_PUBLIC_AI_URL=http://localhost:8787 npm run dev`. `http://localhost:3000`
and `http://127.0.0.1:3000` are already in `ALLOWED_ORIGINS`.

Tests and typecheck (no network, no key needed):

```bash
npm test
npm run typecheck
```

## Configuration

| Name                 | Where                       | Default                                                                         |
| -------------------- | --------------------------- | ------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY` | secret                      | none, required                                                                  |
| `ALLOWED_ORIGINS`    | `vars` in `wrangler.jsonc`  | `https://valorin777.github.io,http://localhost:3000,http://127.0.0.1:3000`      |
| `MODEL`              | `vars` in `wrangler.jsonc`  | `anthropic/claude-haiku-5.5`                                                    |
| `LIMITER`            | `ratelimits` binding        | 30 requests per 60 s                                                            |

Model notes: Claude Haiku 5.5 rejects a non-default `temperature` and thinks by default, so for
the Claude 5 family the worker sends no temperature, and for Haiku 5.x it sends
`reasoning: { effort: "none" }` so thinking cannot use up the small `max_tokens` budget
(140 for `/explain`, 220 for `/coach`). Other models get temperature 0.4 (`/explain`) and 0.7
(`/coach`). See `modelQuirks` in `src/openrouter.ts`.

## Cost

Claude Haiku 5.5 on OpenRouter costs $0.10 per million input tokens and $0.50 per million output
tokens. A coach turn is about 1,000 input + 100 output tokens, roughly **$0.00015**, so a full
16-turn session (8 model calls) costs about a tenth of a cent. An explanation is cheaper still, and repeats come
from the cache for free. The rate limit caps the worst case at 30 calls a minute per IP.
