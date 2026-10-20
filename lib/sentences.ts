import { audioText } from "@/lib/audioKey";
import { readableExercise, reorderSentence } from "@/lib/answers";
import type { Day, Exercise, FinalDay, TenseRef } from "@/lib/content/schema";

/** The whole correct sentence of an exercise, for listening. */
export function fullSentence(ex: Exercise): string {
  switch (ex.type) {
    case "choice":
    case "collocation":
      return ex.prompt.replace("___", ex.options[ex.answer]);
    case "fill":
      return joinWords([ex.before, ex.answers[0], ex.after]);
    case "errorTap":
      return ex.correct;
    case "reorder":
      return reorderSentence(ex.words, ex.end);
  }
}

/** Joins pieces with single spaces, without a space before contractions ('m, n't) or punctuation. */
export function joinWords(parts: readonly string[]): string {
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+('(?:m|s|re|ve|ll|d)\b|n't\b)/gi, "$1")
    .replace(/\s+([.,!?;:])/g, "$1");
}

/** Every English line the app may read aloud for a lesson day (deduplicated, spoken form). */
export function spokenTexts(day: Day): string[] {
  const out: string[] = [];
  for (const t of day.topics) {
    for (const card of t.rules) for (const st of card.steps) if (st.kind === "example") out.push(st.en);
    for (const m of t.mistakes) out.push(m.right);
    if (t.ruNote.example) out.push(t.ruNote.example.en);
    for (const e of t.examples) out.push(e.en);
    for (const ex of t.exercises) {
      out.push(fullSentence(ex));
      out.push(readableExercise(ex).answer);
    }
  }
  for (const s of day.speak) out.push(s.en[0]);
  for (const p of day.phrases) out.push(p.en);
  return unique(out);
}

/** Every English line the tense reference may read aloud for one entry. */
export function tenseSpokenTexts(t: TenseRef): string[] {
  const out: string[] = [];
  for (const f of t.forms) out.push(f.example);
  for (const u of t.uses) out.push(u.example.en);
  for (const v of t.versus) out.push(v.a.en, v.b.en);
  for (const m of t.mistakes) out.push(m.right);
  for (const e of t.examples) out.push(e.en);
  for (const ex of t.exercises) {
    out.push(fullSentence(ex));
    out.push(readableExercise(ex).answer);
  }
  return unique(out);
}

export function finalSpokenTexts(day: FinalDay): string[] {
  return unique(day.speak.map((s) => s.en[0]));
}

function unique(texts: string[]): string[] {
  return [...new Set(texts.map(audioText).filter((t) => /[a-z]/i.test(t)))];
}
