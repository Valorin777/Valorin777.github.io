import { describe, expect, it } from "vitest";
import {
  checkChoice,
  checkErrorTap,
  checkFill,
  checkReorder,
  checkSpoken,
  levenshtein,
  normalize,
  readableExercise,
  reorderSentence,
  shuffleFor,
  tokens,
  variants,
} from "@/lib/answers";
import type {
  ChoiceExercise,
  CollocationExercise,
  ErrorTapExercise,
  FillExercise,
  ReorderExercise,
} from "@/lib/content/schema";

const base = { rule: "be + V3 = passive", explain: "Because." };

function fill(answers: string[], extra: Partial<FillExercise> = {}): FillExercise {
  return { ...base, id: "f1", type: "fill", before: "The film ", after: " at eight.", answers, ...extra };
}

const choice: ChoiceExercise = {
  ...base,
  id: "c1",
  type: "choice",
  prompt: "The meeting ___ at ten.",
  options: ["is started", "started", "was start"],
  answer: 1,
};

const colloc: CollocationExercise = {
  ...base,
  id: "k1",
  type: "collocation",
  prompt: "I ___ a mistake.",
  options: ["did", "made"],
  answer: 1,
};

const errorTap: ErrorTapExercise = {
  ...base,
  id: "e1",
  type: "errorTap",
  sentence: "I am agree with you.",
  wrong: 1,
  correct: "I agree with you.",
};

const reorder: ReorderExercise = {
  ...base,
  id: "r1",
  type: "reorder",
  words: ["the", "film", "started", "at", "eight"],
  alt: [["at", "eight", "the", "film", "started"]],
};

describe("normalize", () => {
  it("lowercases, trims, collapses spaces and strips edge punctuation", () => {
    expect(normalize("  Has   Been  ")).toBe("has been");
    expect(normalize("started.")).toBe("started");
    expect(normalize("\"Started!\"")).toBe("started");
    expect(normalize("“Hello, world?”")).toBe("hello, world");
    expect(normalize("'quoted'")).toBe("quoted");
    expect(normalize("...")).toBe("");
  });

  it("turns curly apostrophes into straight ones and keeps inner apostrophes", () => {
    expect(normalize("I’ve")).toBe("i've");
    expect(normalize("don`t")).toBe("don't");
    expect(normalize("the students'")).toBe("the students'");
  });
});

describe("variants", () => {
  it("expands simple contractions", () => {
    expect(variants("I'm")).toEqual(["i am"]);
    expect(variants("I've done")).toEqual(["i have done"]);
    expect(variants("isn't")).toEqual(["is not"]);
    expect(variants("won't")).toEqual(["will not"]);
    expect(variants("They'll")).toEqual(["they will"]);
    expect(variants("you're")).toEqual(["you are"]);
  });

  it("treats can't, can not and cannot as the same", () => {
    expect(variants("can't")).toEqual(["cannot"]);
    expect(variants("can not")).toEqual(["cannot"]);
    expect(variants("cannot")).toEqual(["cannot"]);
  });

  it("gives both readings of 's and 'd, keeping the possessive", () => {
    expect(variants("he's gone")).toEqual(["he is gone", "he has gone", "he's gone"]);
    expect(variants("she'd left")).toEqual(["she had left", "she would left"]);
    expect(variants("John's car")).toContain("john's car");
  });

  it("dedupes and caps at 16", () => {
    const many = variants("he's she's it's who's what's");
    expect(many.length).toBe(16);
    expect(new Set(many).size).toBe(many.length);
  });

  it("expands contractions that carry trailing punctuation", () => {
    expect(variants("Well, I'm, fine")).toEqual(["well, i am, fine"]);
  });
});

describe("levenshtein", () => {
  it("computes edit distance", () => {
    expect(levenshtein("", "")).toBe(0);
    expect(levenshtein("abc", "")).toBe(3);
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("started", "startd")).toBe(1);
    expect(levenshtein("flaw", "lawn")).toBe(2);
  });
});

describe("checkFill", () => {
  it("accepts exact, case- and punctuation-insensitive answers", () => {
    const ex = fill(["started"]);
    expect(checkFill("started", ex)).toEqual({ correct: true, close: false, expected: "started" });
    expect(checkFill("  Started. ", ex).correct).toBe(true);
  });

  it("rejects empty input", () => {
    expect(checkFill("   ", fill(["started"]))).toEqual({ correct: false, close: false, expected: "started" });
  });

  it("matches contractions in both directions", () => {
    expect(checkFill("I have", fill(["I've"])).correct).toBe(true);
    expect(checkFill("I've", fill(["I have"])).correct).toBe(true);
    expect(checkFill("hasn't been", fill(["has not been"])).close).toBe(false);
    expect(checkFill("he's left", fill(["he has left"])).correct).toBe(true);
    expect(checkFill("he's left", fill(["he is leaving"])).correct).toBe(false);
  });

  it("accepts any listed answer but reports the first as expected", () => {
    const ex = fill(["had finished", "finished"]);
    expect(checkFill("finished", ex)).toEqual({ correct: true, close: false, expected: "had finished" });
  });

  it("tolerates one small typo in a word of 4+ letters", () => {
    expect(checkFill("startd", fill(["started"]))).toEqual({ correct: true, close: true, expected: "started" });
    expect(checkFill("had finnished", fill(["had finished"])).close).toBe(true);
  });

  it("rejects typos in short words, two typos, or two wrong words", () => {
    expect(checkFill("hes", fill(["has"])).correct).toBe(false);
    expect(checkFill("strtd", fill(["started"])).correct).toBe(false);
    expect(checkFill("hav finnished", fill(["had finished"])).correct).toBe(false);
  });

  it("never passes a grammar mistake off as a typo", () => {
    expect(checkFill("know", fill(["knew"])).correct).toBe(false);
    expect(checkFill("works", fill(["work"])).correct).toBe(false);
    expect(checkFill("advices", fill(["advice"])).correct).toBe(false);
    expect(checkFill("advise", fill(["advice"])).correct).toBe(false);
    expect(checkFill("taken", fill(["take"])).correct).toBe(false);
    expect(checkFill("start", fill(["starts"], { base: "start" })).correct).toBe(false);
    expect(checkFill("is started", fill(["started"])).correct).toBe(false);
  });

  it("treats a missing apostrophe as close", () => {
    expect(checkFill("dont know", fill(["don't know"]))).toEqual({ correct: true, close: true, expected: "don't know" });
    expect(checkFill("Ive seen", fill(["I have seen"])).close).toBe(true);
  });
});

describe("choice, errorTap and reorder checks", () => {
  it("compares indices", () => {
    expect(checkChoice(1, choice)).toBe(true);
    expect(checkChoice(0, choice)).toBe(false);
    expect(checkChoice(1, colloc)).toBe(true);
    expect(checkErrorTap(1, errorTap)).toBe(true);
    expect(checkErrorTap(0, errorTap)).toBe(false);
  });

  it("splits tokens on single spaces without empty tokens", () => {
    expect(tokens("I am  agree")).toEqual(["I", "am", "agree"]);
  });

  it("accepts the main order or any alternative", () => {
    expect(checkReorder(["the", "film", "started", "at", "eight"], reorder)).toBe(true);
    expect(checkReorder(["at", "eight", "the", "film", "started"], reorder)).toBe(true);
    expect(checkReorder(["the", "film", "at", "eight", "started"], reorder)).toBe(false);
    expect(checkReorder(["the", "film", "started", "at"], reorder)).toBe(false);
  });

  it("builds the sentence with a capital and an ending", () => {
    expect(reorderSentence(["the", "film", "started"])).toBe("The film started.");
    expect(reorderSentence(["have", "you", "seen", "it"], "?")).toBe("Have you seen it?");
    expect(reorderSentence([])).toBe("");
  });
});

describe("shuffleFor", () => {
  const words = ["the", "film", "started", "at", "eight"];

  it("is deterministic per seed", () => {
    expect(shuffleFor("r1", words)).toEqual(shuffleFor("r1", words));
    expect([...shuffleFor("r1", words)].sort()).toEqual([...words].sort());
  });

  it("never returns the original order", () => {
    for (let i = 0; i < 300; i++) {
      expect(shuffleFor(`seed-${i}`, words)).not.toEqual(words);
      expect(shuffleFor(`s${i}`, ["a", "b", "c"])).not.toEqual(["a", "b", "c"]);
    }
  });

  it("swaps two items and leaves tiny or uniform lists alone", () => {
    expect(shuffleFor("x", [1, 2])).toEqual([2, 1]);
    expect(shuffleFor("x", [1])).toEqual([1]);
    expect(shuffleFor("x", [])).toEqual([]);
    expect(shuffleFor("x", ["a", "a", "a"])).toEqual(["a", "a", "a"]);
  });

  it("differs from the input even with repeated words", () => {
    const repeated = ["the", "cat", "saw", "the", "dog"];
    for (let i = 0; i < 100; i++) expect(shuffleFor(`k${i}`, repeated)).not.toEqual(repeated);
  });

  it("does not mutate the input", () => {
    const input = ["a", "b", "c", "d"];
    shuffleFor("z", input);
    expect(input).toEqual(["a", "b", "c", "d"]);
  });
});

describe("checkSpoken", () => {
  const film = ["The film started at eight."];

  it("matches digits with number words and ignores case and punctuation", () => {
    const r = checkSpoken(["the film started at 8"], film);
    expect(r.correct).toBe(true);
    expect(r.score).toBe(1);
    expect(r.best).toBe("The film started at eight.");
    expect(r.words).toEqual([
      { word: "The", heard: true },
      { word: "film", heard: true },
      { word: "started", heard: true },
      { word: "at", heard: true },
      { word: "eight", heard: true },
    ]);
  });

  it("fails when a key word is missing and marks it unheard", () => {
    const r = checkSpoken(["the film at eight"], film);
    expect(r.correct).toBe(false);
    expect(r.score).toBeCloseTo(0.8);
    expect(r.words.find((w) => w.word === "started")?.heard).toBe(false);
  });

  it("forgives a missing stop word", () => {
    expect(checkSpoken(["film started at eight"], film).correct).toBe(true);
  });

  it("ignores fillers like um", () => {
    const r = checkSpoken(["um the film uh started at eight"], film);
    expect(r.correct).toBe(true);
    expect(r.score).toBe(1);
  });

  it("rejects an extra be verb even when the score is high", () => {
    const r = checkSpoken(["the film is started at eight"], film);
    expect(r.score).toBeGreaterThanOrEqual(0.8);
    expect(r.correct).toBe(false);
  });

  it("uses the best of several recognition alternatives", () => {
    const r = checkSpoken(["the fill started", "the film started at eight", "a film started"], film);
    expect(r.correct).toBe(true);
  });

  it("matches contractions both ways and picks the best accepted answer", () => {
    const accepted = ["I have never been to London.", "I've never been to London."];
    expect(checkSpoken(["I've never been to London"], accepted).correct).toBe(true);
    const r = checkSpoken(["she has left"], ["He is here.", "She's left."]);
    expect(r.correct).toBe(true);
    expect(r.best).toBe("She's left.");
    expect(r.words).toEqual([
      { word: "She's", heard: true },
      { word: "left", heard: true },
    ]);
  });

  it("handles empty transcripts", () => {
    const r = checkSpoken([], film);
    expect(r).toMatchObject({ score: 0, correct: false, best: "The film started at eight." });
    expect(r.words.every((w) => !w.heard)).toBe(true);
    expect(checkSpoken([""], film).correct).toBe(false);
  });
});

describe("readableExercise", () => {
  it("renders every exercise type as plain text", () => {
    expect(readableExercise(choice)).toEqual({ prompt: "The meeting ___ at ten.", answer: "started" });
    expect(readableExercise(colloc)).toEqual({ prompt: "I ___ a mistake.", answer: "made" });
    expect(readableExercise(fill(["started"], { base: "start" }))).toEqual({
      prompt: "The film ___ at eight. (start)",
      answer: "started",
    });
    expect(readableExercise(fill(["Have"], { before: "", after: "you seen it?" })).prompt).toBe("___ you seen it?");
    expect(readableExercise(fill(["went"], { before: "She", after: "." })).prompt).toBe("She ___.");
    expect(readableExercise(errorTap)).toEqual({ prompt: "I am agree with you.", answer: "I agree with you." });
    const r = readableExercise(reorder);
    expect(r.answer).toBe("The film started at eight.");
    expect(r.prompt.split(" / ").sort()).toEqual([...reorder.words].sort());
    expect(r.prompt).not.toBe(reorder.words.join(" / "));
  });
});
