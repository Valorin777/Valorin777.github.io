# Screen specs

Five lines per screen, written before the screen was built.

## Home `/`
1. Job: get the learner into today's work in one tap.
2. Primary action: **Continue** (or **Start Day 1** on the first visit), full width in the thumb zone.
3. States: loading = quiet skeleton of the day card until saved progress is read (no flash of "Start"); first visit = "Start Day 1 · about 45 min"; day finished = "Review cards" or "Start Day 2"; storage blocked = works in memory with one quiet line.
4. Mobile: greeting + streak at the top, today card with progress ring and "about N min left" in the middle, primary button pinned to the bottom safe area; the week path, Review (with due count) and Speak with coach follow below as quiet rows.
5. Motion: card fades up 8 px (200 ms ease-out), progress ring draws once (600 ms ease-out). Nothing else moves.

## Lesson player `/day/[n]`
1. Job: show one step at a time — read, answer, move on.
2. Primary action: one bottom button that changes meaning with the step (Next → Check → Continue); Enter always presses it. Correct answers auto-advance after a short beat.
3. States: loading = skeleton card; locked day = calm explanation with "Open anyway" and "Back to Day 1"; content not out yet = "Arrives in the next update"; wrong answer = feedback panel "Close. Here is the trick." with the rule, the explanation, an optional Russian hint and an AI explanation that loads in place (skeleton line, then text; silent fallback offline).
4. Mobile: top bar with close (saves and returns home), section name and a thin progress bar; lesson column max ~65 characters; answer options in the lower half; primary button pinned to the bottom with safe-area padding.
5. Motion: steps cross-fade with a 12 px slide (220 ms ease-out, interruptible); theory steps reveal with fade-up; answer feedback is a colour shift plus a soft 2 px lift, never a shake.

## Review `/review` (and the review step inside a day)
1. Job: clear due flashcards with honest self-grading (SM-2).
2. Primary action: **Show answer**, then four grades (Again, Hard, Good, Easy — keys 1–4) with the next interval under each.
3. States: empty = "Nothing due. Your cards rest until tomorrow." with the next due date; loading = card skeleton; finished = count reviewed and a way home.
4. Mobile: one card centred in the upper two thirds, grades as a 2×2 grid (4 in a row on wider screens) in the thumb zone; play button on the English side.
5. Motion: the card turns over (rotateY, 250 ms spring); the next card slides in 16 px.

## Speak with coach `/coach`
1. Job: a short spoken conversation that catches the learner's typical mistakes.
2. Primary action: the big microphone button (hold-free: tap to talk, it stops by itself); Space toggles it on desktop.
3. States: no AI configured or offline = the coach explains it needs a connection and offers the offline speaking drill; no speech recognition = a one-line text field instead of the mic; thinking = three soft dots in the coach bubble; error = "I lost the line for a moment. Try again." with retry.
4. Mobile: scenario chips at the top, the last few turns in the middle, corrections as quiet cards inline ("You said … → Better …"), mic button centred in the thumb zone.
5. Motion: mic button breathes gently (scale 1 → 1.04) only while listening; new turns fade up 8 px.

## Settings `/settings`
1. Job: adjust voice and look, then leave. Everything saves on change.
2. Primary action: none needed — a quiet "Done" returns home.
3. States: voices loading = skeleton list; no voices = "Your browser has no English voice. Reading aloud is off."; reset asks once inline (no modal).
4. Mobile: grouped rows (Appearance, Voice, Feedback, Progress), 48 px rows, segmented controls for theme.
5. Motion: segmented control indicator slides (200 ms ease-out). Nothing else.

## Day complete (last step of a day)
1. Job: close the day calmly and show what improved.
2. Primary action: **Back home** (or **Start Day N+1** when available).
3. States: no answers recorded (skipped through) = still a calm summary, mastery shows "not practised"; next day not out yet = "Day 2 arrives in the next update".
4. Mobile: title, minutes spent, streak, per-topic mastery bars with labels and numbers (not colour only), cards added to review.
5. Motion: mastery bars grow once (400 ms ease-out, staggered 40 ms); a single soft chime if sound is on.
