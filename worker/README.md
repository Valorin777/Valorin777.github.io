# b2-sprint-ai

A small Cloudflare Worker that gives B2 Sprint its AI features. The app itself is a static site
on GitHub Pages, which cannot keep secrets, so the browser calls this worker and the worker calls
Claude through [OpenRouter](https://openrouter.ai). The OpenRouter key lives only in the worker as
a secret: it never reaches the browser or the repository.

Voices, speech recognition and a backup language model come from
[Workers AI](https://developers.cloudflare.com/workers-ai/) through the `AI` binding, so the app
keeps talking when OpenRouter is out of credits.

## Endpoints

| Method + path     | Body                                                                                          | Response                                       |
| ----------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `GET /health`     | none                                                                                          | `{ ok: true, model }`                          |
| `GET /voices`     | none                                                                                          | `{ voices: Voice[], default: VoiceId }`        |
| `POST /explain`   | `{ exerciseId, task, given, right, rule, category, lang: "en" \| "ru" }`                      | `{ text, cached }`                             |
| `POST /coach`     | `{ history: [{ role: "user" \| "assistant", text }] (1–16, last is "user"), scenario, focus[], level: "B1" \| "B2" }` | `{ reply, correction: { wrong, right, why } \| null, ended }` |
| `POST /translate` | `{ text (1–600 chars), to: "ru" \| "en" \| "auto" }`                                          | `{ translation, from: "en" \| "ru", notes: [{ phrase, meaning }] (0–3) }` |
| `POST /tts`       | `{ text (1–300 chars, one line), voice: VoiceId }`                                            | `audio/mpeg` bytes (`audio/wav` from the fallback) |
| `POST /stt?lang=en\|ru` | raw audio, `Content-Type` `audio/webm`, `audio/mp4`, `audio/ogg`, `audio/mpeg` or `audio/wav`, at most 1.5 MB | `{ text }` (`""` for silence) |

- `/explain`: one or two calm sentences on why the learner's answer does not fit and what the
  rule is (English or Russian, at most about 45 words, `**bold**` for the key form). Answers are
  cached in KV (`ex:` + SHA-256 of model + exercise id + normalized answer + language), so the
  same mistake costs one model call. Without the KV binding the edge cache is used instead.
- `/coach`: the spoken-practice partner. It replies in 1–3 short sentences, asks one follow-up
  question and returns at most one correction of the learner's last message. A correction is
  dropped if it quotes words the learner did not say. With 16 turns in the history, `ended` is
  true and the reply wraps the session up.
- `/translate`: natural, idiomatic translation (never word for word) for a Russian speaker.
  `auto` translates Russian → English when the text is mainly Cyrillic, otherwise English →
  Russian; `from` says which way it went. `notes` are up to 3 phrases from the source worth
  learning (collocations, phrasal verbs, idioms, tricky grammar) with a short meaning in Russian
  (EN→RU) or a short English note (RU→EN); a note whose phrase is not in the source is dropped.
  Cached in KV for 30 days (`tr:` + SHA-256 of `to|text`).
- `/voices`: the curated tutor voices, `Voice = { id, label, accent: "US" | "UK" | "AU" | "IE",
  gender, model }`. `a2-…` ids are Deepgram Aura-2 (the most natural), `a1-…` are Aura-1
  (cheaper, faster). Default: `a2-thalia`.
- `/tts`: the audio is cached in KV forever (`tts:` + SHA-256 of `voice|text`), so a sentence
  costs one synthesis ever. Headers: `Cache-Control: public, max-age=31536000, immutable`,
  `X-TTS-Model` (the model that spoke), `X-Cache: hit | miss`. If Aura fails (for example error
  4006, the daily free allocation is used up), MeloTTS answers instead: robotic but free, sent
  as `audio/wav` with `Cache-Control: public, max-age=86400` and cached under its own key, so the
  real voice replaces it as soon as Aura works again. Clients should not keep MeloTTS audio
  (`X-TTS-Model: @cf/myshell-ai/melotts`) for long.
- `/stt`: Whisper large-v3-turbo with the given language (voice-activity filter on), falling back
  to the original Whisper. Whisper's typical inventions on silence ("Thank you.",
  "Продолжение следует...") come back as `""`.

`/explain`, `/coach` and `/translate` set `X-AI-Model` to the model that answered; `/stt` sets it
to the Whisper model. `X-TTS-Model`, `X-AI-Model` and `X-Cache` are exposed to the browser.

### Backup model

When OpenRouter fails for `/explain`, `/coach` or `/translate` (402 out of credits, 429, 5xx,
timeout, missing key, or an answer that cannot be used), the worker retries once with the same
messages on Workers AI, `@cf/openai/gpt-oss-120b` by default (`AI_MODEL`). It gets
`reasoning_effort: "low"` (about 2 s per coach turn instead of 6 s), 512 extra tokens for its
reasoning, and JSON mode for `/coach` and `/translate`; the same defensive parsers clean the
output. Answers from the backup model are cached for 3 days instead of 30, so a Claude answer
replaces them once the credits are back.

Errors are JSON `{ error }`: `400 invalid`, `403 forbidden` (origin not allowed),
`413 too-large`, `415 unsupported` (`/stt` content type), `429 rate-limit`, `502 upstream`
(OpenRouter and the backup both failed, or the voice / speech models failed; no details are
passed on), `503 unavailable` (a rate limiter binding is missing).

## Protection

- **CORS:** only origins listed in `ALLOWED_ORIGINS` get `Access-Control-Allow-Origin`, and
  POSTs from any other origin (or with no origin) get 403. Preflights are cached for a day.
- **Device id:** every POST needs an `X-Device-Id` header (UUID-like, at most 64 characters).
- **Rate limit:** the `LIMITER` binding allows 30 requests a minute per device + IP for
  `/explain`, `/coach` and `/translate`; `TTS_LIMITER` allows 120 a minute for `/tts` and `/stt`
  (a lesson plays many short clips). Each binding is also checked with the key `ip:<IP>`, so one
  IP cannot get around it by rotating device ids. The limiters fail closed.
- **Payloads:** JSON bodies over 8 KB and audio over 1.5 MB are refused before parsing (by
  `Content-Length` and while reading); every field is validated by Zod with length caps;
  unknown fields are rejected; only the curated voice ids are accepted.
- **Logs:** only the route, the upstream status and the Workers AI error code. The key, prompts,
  the learner's text and audio are never logged.

## Set up and deploy

```bash
cd worker
npm install
npx wrangler login                          # once, opens the browser
npx wrangler secret put OPENROUTER_API_KEY  # paste the key when asked
npx wrangler deploy
```

The KV namespace (`TTS_CACHE`) and both rate limiters are declared in `wrangler.jsonc`; Workers
AI needs no setup beyond the `ai` binding.

`wrangler deploy` prints the worker URL, for example `https://b2-sprint-ai.<account>.workers.dev`.
Build the app with that URL so the client can find it:

```bash
NEXT_PUBLIC_AI_URL=https://b2-sprint-ai.<account>.workers.dev npm run build
```

Without `NEXT_PUBLIC_AI_URL` the app simply hides the AI features.

Check it: `curl https://b2-sprint-ai.<account>.workers.dev/health`.

The Cache API (`caches.default`) stores nothing on a `*.workers.dev` URL, which is why audio,
translations and explanations are cached in KV.

## Local development

```bash
cd worker
cp .dev.vars.example .dev.vars   # then put the real key into .dev.vars (it is git-ignored)
npx wrangler dev                 # http://localhost:8787
```

Under `wrangler dev`, KV and the rate limiters are local, but Workers AI always runs remotely and
uses the account's daily free allocation. Run the app with
`NEXT_PUBLIC_AI_URL=http://localhost:8787 npm run dev`. `http://localhost:3000` and
`http://127.0.0.1:3000` are already in `ALLOWED_ORIGINS`.

Tests and typecheck (no network, no key needed; Workers AI and KV are faked):

```bash
npm test
npm run typecheck
```

## Configuration

| Name                 | Where                       | Default                                                                         |
| -------------------- | --------------------------- | ------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY` | secret                      | none; without it every LLM call goes straight to Workers AI                    |
| `ALLOWED_ORIGINS`    | `vars` in `wrangler.jsonc`  | `https://valorin777.github.io,http://localhost:3000,http://127.0.0.1:3000`      |
| `MODEL`              | `vars` in `wrangler.jsonc`  | `anthropic/claude-haiku-5.5`                                                    |
| `AI_MODEL`           | `vars` in `wrangler.jsonc`  | `@cf/openai/gpt-oss-120b` (backup LLM on Workers AI)                            |
| `AI`                 | `ai` binding                | Workers AI                                                                      |
| `TTS_CACHE`          | `kv_namespaces` binding     | namespace `fdb9329e6d62476291535457c7be6b21`, prefixes `tts:`, `tr:`, `ex:`      |
| `LIMITER`            | `ratelimits` binding        | 30 requests per 60 s                                                            |
| `TTS_LIMITER`        | `ratelimits` binding        | 120 requests per 60 s                                                           |

Model notes: Claude Haiku 5.5 rejects a non-default `temperature` and thinks by default, so for
the Claude 5 family the worker sends no temperature, and for Haiku 5.x it sends
`reasoning: { effort: "none" }` so thinking cannot use up the small `max_tokens` budget
(140 for `/explain`, 220 for `/coach`, 900 for `/translate`). Other models get temperature 0.4
(`/explain`), 0.7 (`/coach`) and 0.3 (`/translate`). See `modelQuirks` in `src/openrouter.ts`.

## Cost

Claude Haiku 5.5 on OpenRouter costs $0.10 per million input tokens and $0.50 per million output
tokens. A coach turn is about 1,000 input + 100 output tokens, roughly **$0.00015**, so a full
16-turn session (8 model calls) costs about a tenth of a cent. An explanation is cheaper still, and repeats come
from the cache for free. The rate limit caps the worst case at 30 calls a minute per IP.

Workers AI includes **10,000 neurons a day for free** (about $0.11 of usage; $0.011 per 1,000
neurons beyond that on the paid plan). On the free plan every Workers AI call fails with error
4006 once the day's allocation is used up, MeloTTS included; the app should then fall back to the
browser's own speech.

| Model                                | Price                    | Rough free-tier capacity per day       |
| ------------------------------------ | ------------------------ | -------------------------------------- |
| `@cf/deepgram/aura-1` (`a1-…`)       | ≈ $0.015 / 1,000 chars   | ≈ 7,000 characters of new speech       |
| `@cf/deepgram/aura-2-en` (`a2-…`)    | ≈ $0.03 / 1,000 chars    | ≈ 3,500 characters of new speech       |
| `@cf/myshell-ai/melotts`             | ≈ free ($0.0002 / min)   | practically unlimited                  |
| `@cf/openai/whisper-large-v3-turbo`  | ≈ $0.0005 / audio minute | ≈ 200 minutes                          |
| `@cf/openai/gpt-oss-120b`            | $0.35 / $0.75 per M tokens in / out | ≈ 500 coach turns or explanations |

Cached audio is free: a sentence of the course is synthesized once and then comes from KV.
Coach replies are new text every time, so they are what uses the voice budget: a 16-turn session
is about 8 replies × 150 characters ≈ 1,200 characters (≈ a third of the daily Aura-2 allowance,
≈ a sixth with an `a1-…` voice). KV's free tier allows 100,000 reads and 1,000 writes a day.
