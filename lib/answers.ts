import type {
  ChoiceExercise,
  CollocationExercise,
  ErrorTapExercise,
  Exercise,
  FillExercise,
  ReorderExercise,
} from "@/lib/content/schema";

/* ------------------------------------------------------------- normalising */

const APOSTROPHES = /[‘’‚‛ʼʹ`´′]/g;
const DOUBLE_QUOTES = /[“”„‟«»″]/g;
const EDGE_PUNCT = /^[\s.,!?;:"…]+|[\s.,!?;:"…]+$/g;

/** Lowercase, straight quotes, single spaces, no punctuation or quotes around the answer. */
export function normalize(s: string): string {
  let out = s.toLowerCase().replace(APOSTROPHES, "'").replace(DOUBLE_QUOTES, "\"").replace(/\s+/g, " ").trim();
  for (;;) {
    const before = out;
    out = out.replace(EDGE_PUNCT, "");
    // Only strip a ' that wraps the whole answer: a lone trailing one can be a plural possessive.
    if (out.length >= 2 && out.startsWith("'") && out.endsWith("'")) out = out.slice(1, -1).trim();
    if (out === before) return out;
  }
}

/* ------------------------------------------------------------ contractions */

const MAX_VARIANTS = 16;

const WHOLE_WORD: Record<string, string[]> = {
  "won't": ["will not"],
  "can't": ["cannot"],
  "shan't": ["shall not"],
  "i'm": ["i am"],
};

/** Every reading of one lowercase word, contractions expanded ("he's" → is / has / possessive). */
function expandWord(word: string): string[] {
  const whole = WHOLE_WORD[word];
  if (whole) return whole;
  let m = /^(.+)n't$/.exec(word);
  if (m) return [`${m[1]} not`];
  m = /^(.+)'re$/.exec(word);
  if (m) return [`${m[1]} are`];
  m = /^(.+)'ve$/.exec(word);
  if (m) return [`${m[1]} have`];
  m = /^(.+)'ll$/.exec(word);
  if (m) return [`${m[1]} will`];
  m = /^(.+)'m$/.exec(word);
  if (m) return [`${m[1]} am`];
  m = /^(.+)'d$/.exec(word);
  if (m) return [`${m[1]} had`, `${m[1]} would`];
  m = /^(.+)'s$/.exec(word);
  if (m) return [`${m[1]} is`, `${m[1]} has`, word];
  return [word];
}

/** Splits trailing punctuation off a token so "i'm," still expands. */
function expandToken(token: string): string[] {
  const m = /^(.*?)([.,!?;:"]*)$/.exec(token);
  const core = m ? m[1] : token;
  const tail = m ? m[2] : "";
  if (core === "") return [token];
  return expandWord(core).map((w) => w + tail);
}

function product(choices: readonly string[][], cap: number): string[] {
  let acc: string[] = [""];
  for (const options of choices) {
    const next: string[] = [];
    for (const prefix of acc) {
      for (const option of options) {
        next.push(prefix === "" ? option : `${prefix} ${option}`);
        if (next.length >= cap) break;
      }
      if (next.length >= cap) break;
    }
    acc = next;
  }
  return acc;
}

/** All normalized readings of `s` with contractions expanded (deduped, at most 16). */
export function variants(s: string): string[] {
  const norm = normalize(s);
  if (norm === "") return [""];
  const forms = product(norm.split(" ").map(expandToken), MAX_VARIANTS * 4).map((v) =>
    v.replace(/\bcan not\b/g, "cannot"),
  );
  return [...new Set(forms)].slice(0, MAX_VARIANTS);
}

/** Contractions typed without the apostrophe. Only words that are not real English words. */
const NO_APOSTROPHE: Record<string, string> = {
  dont: "don't",
  doesnt: "doesn't",
  didnt: "didn't",
  isnt: "isn't",
  arent: "aren't",
  wasnt: "wasn't",
  werent: "weren't",
  havent: "haven't",
  hasnt: "hasn't",
  hadnt: "hadn't",
  couldnt: "couldn't",
  shouldnt: "shouldn't",
  wouldnt: "wouldn't",
  mustnt: "mustn't",
  wont: "won't",
  cant: "can't",
  im: "i'm",
  ive: "i've",
  youre: "you're",
  theyre: "they're",
  youve: "you've",
  weve: "we've",
  theyve: "they've",
  youll: "you'll",
  theyll: "they'll",
  hes: "he's",
  shes: "she's",
  thats: "that's",
  whats: "what's",
  theres: "there's",
};

function restoreApostrophes(norm: string): string {
  return norm
    .split(" ")
    .map((w) => NO_APOSTROPHE[w] ?? w)
    .join(" ");
}

/* ----------------------------------------------------------- edit distance */

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

const VOWELS = "aeiou";

/**
 * One-letter differences that are grammar, not spelling, so they must not pass as a typo:
 * work/works, live/lived, take/taken, advice/advices (an added final s/d/n), know/knew,
 * begin/began, forget/forgot, than/then (a vowel swap in a short word), advice/advise (c/s).
 */
function isGrammarEdit(given: string, expected: string): boolean {
  if (given.length !== expected.length) {
    const [short, long] = given.length < expected.length ? [given, expected] : [expected, given];
    return long.startsWith(short) && "sdn".includes(long[long.length - 1]);
  }
  for (let i = 0; i < given.length; i++) {
    const a = given[i];
    const b = expected[i];
    if (a === b) continue;
    if (VOWELS.includes(a) && VOWELS.includes(b) && expected.length <= 6) return true;
    if ((a === "c" && b === "s") || (a === "s" && b === "c")) return true;
    return false;
  }
  return false;
}

/** True when `given` equals `expected` except for one word with a one-letter typo. */
function isTypo(given: string, expected: string, blocked: ReadonlySet<string>): boolean {
  const g = given.split(" ");
  const e = expected.split(" ");
  if (g.length !== e.length) return false;
  let diffs = 0;
  for (let i = 0; i < g.length; i++) {
    if (g[i] === e[i]) continue;
    diffs++;
    if (diffs > 1) return false;
    if (e[i].length < 4 || blocked.has(g[i])) return false;
    if (levenshtein(g[i], e[i]) !== 1 || isGrammarEdit(g[i], e[i])) return false;
  }
  return diffs === 1;
}

/* ---------------------------------------------------------------- checking */

export interface CheckResult {
  correct: boolean;
  close: boolean;
  expected: string;
}

const intersects = (a: readonly string[], b: readonly string[]): boolean => a.some((x) => b.includes(x));

export function checkFill(input: string, ex: FillExercise): CheckResult {
  const expected = ex.answers[0] ?? "";
  const miss: CheckResult = { correct: false, close: false, expected };
  const close: CheckResult = { correct: true, close: true, expected };
  const norm = normalize(input);
  if (norm === "") return miss;

  const given = variants(norm);
  const accepted = ex.answers.map(variants);
  if (accepted.some((av) => intersects(given, av))) return { correct: true, close: false, expected };

  const restored = variants(restoreApostrophes(norm));
  if (accepted.some((av) => intersects(restored, av))) return close;

  // Typing the base form unchanged is the mistake the exercise tests, never a typo.
  const blocked = new Set(ex.base ? [normalize(ex.base)] : []);
  for (const g of new Set([...given, ...restored])) {
    for (const av of accepted) {
      if (av.some((a) => isTypo(g, a, blocked))) return close;
    }
  }
  return miss;
}

export function checkChoice(index: number, ex: ChoiceExercise | CollocationExercise): boolean {
  return index === ex.answer;
}

export function checkErrorTap(index: number, ex: ErrorTapExercise): boolean {
  return index === ex.wrong;
}

export function tokens(sentence: string): string[] {
  return sentence.split(" ").filter((t) => t.length > 0);
}

const sameWords = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((w, i) => w === b[i]);

export function checkReorder(order: string[], ex: ReorderExercise): boolean {
  return [ex.words, ...(ex.alt ?? [])].some((words) => sameWords(order, words));
}

export function reorderSentence(words: string[], end: "." | "?" | "!" = "."): string {
  const text = words.filter((w) => w.length > 0).join(" ");
  if (text === "") return "";
  return text.charAt(0).toUpperCase() + text.slice(1) + end;
}

/* --------------------------------------------------------------- shuffling */

function hashSeed(seed: string): number {
  // FNV-1a, 32-bit.
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(seed: string, items: readonly T[]): T[] {
  const out = [...items];
  const rand = mulberry32(hashSeed(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const sameOrder = <T>(a: readonly T[], b: readonly T[]): boolean => a.every((x, i) => Object.is(x, b[i]));

/** Deterministic shuffle; for two or more items that are not all equal it never returns the input order. */
export function shuffleFor<T>(seed: string, items: readonly T[]): T[] {
  if (items.length < 2) return [...items];
  if (items.length === 2) return [items[1], items[0]];
  for (let attempt = 0; attempt < 12; attempt++) {
    const out = seededShuffle(attempt === 0 ? seed : `${seed}+${attempt}`, items);
    if (!sameOrder(out, items)) return out;
  }
  // A rotation by one differs from the input unless every item is equal.
  return [...items.slice(1), items[0]];
}

/* ---------------------------------------------------------------- speaking */

export interface SpokenWord {
  word: string;
  heard: boolean;
}

export interface SpokenResult {
  score: number;
  correct: boolean;
  best: string;
  words: SpokenWord[];
}

const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
  "nineteen", "twenty",
];
const FILLERS = new Set(["um", "umm", "uh", "uhm", "er", "erm", "ah", "eh", "hmm", "mm"]);
const STOP_WORDS = new Set(["a", "an", "the", "to", "of", "and", "in", "on", "at", "for"]);
/** Saying one of these when the answer has none changes the grammar ("is started") or the meaning. */
const CRITICAL_WORDS = ["am", "is", "are", "was", "were", "be", "been", "being", "not"];
const WORD_EDGES = /^[^A-Za-z0-9À-ɏ]+|[^A-Za-z0-9À-ɏ]+$/g;

interface SpeechVariant {
  tokens: string[];
  /** Index into `display` of the word each token came from. */
  origin: number[];
}

interface SpeechForm {
  display: string[];
  variants: SpeechVariant[];
}

function speechTokens(part: string): string[][] {
  const n = /^\d+$/.test(part) ? Number(part) : -1;
  const word = n >= 0 && n <= 20 ? NUMBER_WORDS[n] : part;
  // "cannot" is split so "can not", "can't" and "cannot" all align word by word.
  return expandWord(word).map((v) => v.split(" ").flatMap((t) => (t === "cannot" ? ["can", "not"] : [t])));
}

function speechForm(text: string, dropFillers: boolean): SpeechForm {
  const display: string[] = [];
  let acc: SpeechVariant[] = [{ tokens: [], origin: [] }];
  for (const raw of text.replace(APOSTROPHES, "'").split(/\s+/)) {
    const clean = raw.replace(WORD_EDGES, "");
    if (clean === "") continue;
    const parts = clean
      .toLowerCase()
      .replace(/\./g, "")
      .split(/[^a-z0-9À-ɏ']+/)
      .filter((p) => p.length > 0);
    if (parts.length === 0) continue;
    if (dropFillers && parts.length === 1 && FILLERS.has(parts[0])) continue;

    let wordAlts: string[][] = [[]];
    for (const part of parts) {
      const next: string[][] = [];
      for (const prefix of wordAlts) for (const alt of speechTokens(part)) next.push([...prefix, ...alt]);
      wordAlts = next.slice(0, MAX_VARIANTS);
    }

    const index = display.length;
    display.push(clean);
    const next: SpeechVariant[] = [];
    for (const v of acc) {
      for (const alt of wordAlts) {
        next.push({ tokens: [...v.tokens, ...alt], origin: [...v.origin, ...alt.map(() => index)] });
      }
    }
    acc = next.slice(0, MAX_VARIANTS);
  }
  return { display, variants: acc };
}

/** Longest common subsequence of two word lists; `matched[i]` is true when a[i] is part of it. */
function lcs(a: readonly string[], b: readonly string[]): { length: number; matched: boolean[] } {
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const matched = a.map(() => false);
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      matched[i] = true;
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return { length: table[0][0], matched };
}

const countOf = (words: readonly string[], w: string): number => words.filter((x) => x === w).length;

function markWords(form: SpeechForm, variant: SpeechVariant | null, matched: readonly boolean[]): SpokenWord[] {
  return form.display.map((word, index) => {
    if (!variant) return { word, heard: false };
    const own = variant.origin.flatMap((o, t) => (o === index ? [t] : []));
    return { word, heard: own.length > 0 && own.every((t) => matched[t]) };
  });
}

/**
 * Compares speech recognition alternatives with the accepted answers word by word. Contractions,
 * numbers 0–20 and fillers ("um") do not count against the learner; an extra "is"/"am"/"not"
 * that the answer does not have does.
 */
export function checkSpoken(transcripts: string[], accepted: string[]): SpokenResult {
  type Candidate = {
    answer: number;
    score: number;
    correct: boolean;
    form: SpeechForm;
    variant: SpeechVariant;
    matched: boolean[];
  };
  let best: Candidate | null = null;
  const heardForms = transcripts.map((t) => speechForm(t, true));

  for (let answer = 0; answer < accepted.length; answer++) {
    const form = speechForm(accepted[answer], false);
    for (const heard of heardForms) {
      for (const ev of form.variants) {
        for (const hv of heard.variants) {
          const denom = Math.max(ev.tokens.length, hv.tokens.length);
          if (denom === 0 || hv.tokens.length === 0) continue;
          const { length, matched } = lcs(ev.tokens, hv.tokens);
          const score = length / denom;
          const heardSet = new Set(hv.tokens);
          const keysPresent = ev.tokens.every((w) => STOP_WORDS.has(w) || heardSet.has(w));
          const noExtras = CRITICAL_WORDS.every((w) => countOf(hv.tokens, w) <= countOf(ev.tokens, w));
          const correct = score >= 0.8 && keysPresent && noExtras;
          const better =
            best === null || (correct && !best.correct) || (correct === best.correct && score > best.score);
          if (better) best = { answer, score, correct, form, variant: ev, matched };
        }
      }
    }
  }

  if (!best) {
    const first = accepted[0] ?? "";
    return { score: 0, correct: false, best: first, words: markWords(speechForm(first, false), null, []) };
  }
  return {
    score: best.score,
    correct: best.correct,
    best: accepted[best.answer],
    words: markWords(best.form, best.variant, best.matched),
  };
}

/* ------------------------------------------------------------- plain text */

function gapSentence(before: string, after: string): string {
  const b = before.trimEnd();
  const a = after.trimStart();
  const left = b === "" ? "" : `${b} `;
  const right = a === "" ? "" : /^[A-Za-z0-9(]/.test(a) ? ` ${a}` : a;
  return `${left}___${right}`;
}

/** Plain text of an exercise for flashcards, the error log and AI prompts. */
export function readableExercise(ex: Exercise): { prompt: string; answer: string } {
  switch (ex.type) {
    case "choice":
    case "collocation":
      return { prompt: ex.prompt, answer: ex.options[ex.answer] ?? "" };
    case "fill":
      return {
        prompt: gapSentence(ex.before, ex.after) + (ex.base ? ` (${ex.base})` : ""),
        answer: ex.answers[0] ?? "",
      };
    case "errorTap":
      return { prompt: ex.sentence, answer: ex.correct };
    case "reorder":
      return { prompt: shuffleFor(ex.id, ex.words).join(" / "), answer: reorderSentence(ex.words, ex.end) };
  }
}
