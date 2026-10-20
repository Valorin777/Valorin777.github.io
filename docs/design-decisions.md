# Design decisions

One line per non-obvious choice, with the reason.

- No local design knowledge base (Emil Kowalski, Impeccable) was found in the workspace, so their published principles were applied directly: strong ease-out curves, 150–250 ms, transform/opacity only, interruptible transitions, no bounce, tinted neutrals, OKLCH tokens, a real type scale, ~65ch measure.
- Static export on GitHub Pages, AI in a Cloudflare Worker — Pages is free and already hosts the owner's other sites; the worker keeps the OpenRouter key server-side.
- Claude Haiku 5.5 through OpenRouter — fast enough for a spoken conversation and about $0.0002 per turn.
- Warm ivory light theme and blue-grey dark theme (never #000) — long sessions at night stay easy on the eyes; pure black makes text halate.
- One accent, ink blue — calm and readable; it marks only the primary action, progress and emphasis.
- Feedback colours are tints (green-grey for right, amber for "close"), never red — mistakes are part of learning, not alarms.
- Every state also has words ("Not quite", "Better", "Your answer", underlined missed words) — colour is never the only signal.
- Source Serif 4 for headings, Onest for UI and lesson text — an editorial serif gives the premium calm; Onest is clean, has Cyrillic for the Russian notes, and stays legible at 19 px.
- Lesson text at 19 px with 30 px line height — the learner reads in a second language; bigger, airier text lowers effort.
- One primary button, always at the bottom in the thumb zone — the learner never looks for "what next".
- Enter presses the primary button everywhere; 1–4 pick options; Space plays audio — keyboard learners never need the mouse.
- Correct answers auto-advance after one second; wrong answers wait for "Continue" — momentum when it goes well, time to read the trick when it doesn't.
- Choice and error-tap answer on the first tap, no separate "Check" — one tap per question keeps the rhythm; typed and reorder answers need "Check" because they are built up.
- No retry loop on a wrong answer — the correct form is shown at once and becomes a flashcard; SM-2 brings it back at the right time instead.
- The static explanation from content shows instantly; the personal AI explanation loads under it — the learner is never blocked on the network.
- Russian hints only on request — reading the Russian first stops the learner from thinking in English.
- Theory cards reveal one point at a time — one idea per tap matches "one screen, one job" and stops long-text fatigue.
- "Common mistake → natural English" is its own step for every topic — Russian-speaker errors are predictable, so they are named, not just avoided.
- Listen-and-repeat has a hands-free mode with pauses sized to the sentence — shadowing builds speaking rhythm without touching the phone.
- The speaking drill falls back to "say it aloud, then grade yourself" where the browser can't listen (Firefox, some Android webviews) — the exercise still works everywhere.
- The coach corrects only one mistake per reply — more than one turns conversation into a test.
- Progress is local-first (one localStorage document) behind the same actions Firestore will use in Phase 2 — the app works offline and without an account from the first second.
- Skeletons until saved progress is read — avoids a flash of "Start Day 1" for a learner who is halfway through.
- Theme is applied by a tiny inline script before first paint — no white flash in dark mode.
- Progress bars animate scaleX, not width — transform-only animation stays at 60 fps on low-end phones.
- The progress ring draws once on mount, then only follows real changes — motion explains state, never decorates.
- Card flip uses a soft spring (rotateY) — the one place where physical metaphor helps: the answer is "on the back".
- prefers-reduced-motion turns all motion off (MotionConfig "user" plus a CSS guard).
- Day N+1 unlocks after Day N, with a quiet "Open anyway" — structure by default, freedom when the learner knows better.
- Time left is estimated from per-step seconds, not a fixed 45 — "about 12 min left" is honest after a pause.
- The coach records a whole spoken answer (MediaRecorder → Whisper on the worker) instead of using the browser's recogniser — browsers end recognition at the first pause, and a learner thinking mid-sentence was being cut off. Our own pause detection ends the answer after ~2.6 s of quiet, or ~3.8 s after a hesitant start ("well… um"), and the tick button sends it at once.
- The voice threshold follows the room's noise floor (quietest level of the last 5 s × 3, clamped) instead of a fixed level — a quiet mic and a noisy room both work; a live five-bar meter shows the learner they are being heard.
- "Waiting for the first words" and "answer length" are two separate limits — 15 s to start, 90 s to finish — so a long answer is never cut by the start timeout.
- Hands-free starts listening 350 ms after the coach stops speaking and retries once when it heard nothing — the speaker hands the audio back to the mic (iOS) and a learner who is still thinking gets a second window.
- The tense reference explains in Russian and practises in English — it is a cheat sheet to understand, unlike the lessons, which keep the learner in English. Every entry shows the same order: idea, timeline, forms, uses, signal words, "don't mix it up", typical mistakes, the trick, examples, practice.
- The tense map shows forms ("I was working"), not names — the learner recognises the shape they would say, then opens the rule.
