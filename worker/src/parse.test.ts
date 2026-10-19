import { describe, expect, it } from "vitest";
import {
  clampWords,
  cleanText,
  correctionFits,
  extractJsonObject,
  parseCoachOutput,
  stripCodeFences,
  fixBeRule,
  pairExamples,
  parseCoachAnalysis,
  escalate,
  normalizeErrorType,
} from "./parse";

describe("stripCodeFences", () => {
  it("removes a fence with or without a language tag", () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripCodeFences('```\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripCodeFences('  ```JSON {"a":1}```  ')).toBe('{"a":1}');
  });

  it("leaves unfenced text alone", () => {
    expect(stripCodeFences("  plain text ")).toBe("plain text");
  });
});

describe("extractJsonObject", () => {
  it("parses plain, fenced and chatty JSON", () => {
    expect(extractJsonObject('{"reply":"Hi"}')).toEqual({ reply: "Hi" });
    expect(extractJsonObject('```json\n{"reply":"Hi"}\n```')).toEqual({ reply: "Hi" });
    expect(extractJsonObject('Sure! Here it is: {"reply":"Hi"} Hope it helps.')).toEqual({ reply: "Hi" });
  });

  it("returns null for non-objects and broken JSON", () => {
    expect(extractJsonObject("[1,2]")).toBeNull();
    expect(extractJsonObject("no json here")).toBeNull();
    expect(extractJsonObject('{"reply": "Hi')).toBeNull();
  });
});

describe("parseCoachOutput", () => {
  it("reads reply and correction from clean JSON", () => {
    const out = parseCoachOutput(
      JSON.stringify({
        reply: "Sounds lovely! Who did you go with?",
        correction: { wrong: "I am went", right: "I went", why: "Past simple has no 'be'." },
      }),
    );
    expect(out).toEqual({
      reply: "Sounds lovely! Who did you go with?",
      correction: { wrong: "I am went", right: "I went", why: "Past simple has no 'be'.", type: "other" },
      tip: null,
    });
  });

  it("handles fenced JSON and a null correction", () => {
    const out = parseCoachOutput('```json\n{"reply":"Great. What next?","correction":null}\n```');
    expect(out).toEqual({ reply: "Great. What next?", correction: null, tip: null });
  });

  it("drops a malformed correction but keeps the reply", () => {
    const out = parseCoachOutput('{"reply":"Nice! Why?","correction":{"wrong":"","right":"x","why":"y"}}');
    expect(out).toEqual({ reply: "Nice! Why?", correction: null, tip: null });
    const noWhy = parseCoachOutput('{"reply":"Nice! Why?","correction":{"wrong":"a","right":"b"}}');
    expect(noWhy?.correction).toBeNull();
  });

  it("salvages the reply from JSON cut off by max_tokens", () => {
    const out = parseCoachOutput('{"reply": "Cool \\"park\\" day! What did you eat?", "correction": {"wrong": "I am');
    expect(out).toEqual({ reply: 'Cool "park" day! What did you eat?', correction: null, tip: null });
  });

  it("falls back to plain text with no correction", () => {
    expect(parseCoachOutput("That sounds fun! What was the best part?")).toEqual({
      reply: "That sounds fun! What was the best part?",
      correction: null,
      tip: null,
    });
  });

  it("returns null when there is nothing usable", () => {
    expect(parseCoachOutput("   ")).toBeNull();
    expect(parseCoachOutput('{"answer":"hi"}')).toBeNull();
    expect(parseCoachOutput('{"reply": 42}')).toBeNull();
    expect(parseCoachOutput("{ broken")).toBeNull();
  });

  it("strips markdown from spoken replies", () => {
    const out = parseCoachOutput('{"reply":"**Great** job! *Really*. What next?","correction":null}');
    expect(out?.reply).toBe("Great job! Really. What next?");
  });
});

describe("cleanText", () => {
  it("keeps balanced **bold** for explanations", () => {
    expect(cleanText("Use **started**: no *be* here.", { maxWords: 45, bold: true })).toBe(
      "Use **started**: no be here.",
    );
  });

  it("removes an unbalanced ** marker", () => {
    expect(cleanText("Use **started here.", { maxWords: 45, bold: true })).toBe("Use started here.");
  });

  it("flattens headings, bullets, code and line breaks, and unwraps quotes", () => {
    const raw = '"# Rule\n- Use `started`\n- not is started"';
    expect(cleanText(raw, { maxWords: 45, bold: true })).toBe("Rule Use started not is started");
  });

  it("clamps long output", () => {
    const long = Array.from({ length: 100 }, (_, i) => `w${i}`).join(" ");
    const out = cleanText(long, { maxWords: 10, bold: false });
    expect(out.split(" ")).toHaveLength(10);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("clampWords", () => {
  it("prefers ending on a sentence boundary", () => {
    expect(clampWords("One two three four. Five six seven eight nine", 6)).toBe("One two three four.");
  });

  it("returns short text unchanged", () => {
    expect(clampWords("Short text.", 10)).toBe("Short text.");
  });
});

describe("correctionFits", () => {
  const said = "yesterday i am went to the park with my friends";

  it("accepts a fragment the learner actually said", () => {
    expect(correctionFits({ wrong: "I am went", right: "I went", why: "x" }, said)).toBe(true);
    expect(correctionFits({ wrong: "I am went,", right: "I went", why: "x" }, "Yesterday I am went.")).toBe(true);
  });

  it("rejects quotes the learner never said and no-op corrections", () => {
    expect(correctionFits({ wrong: "I have gone", right: "I went", why: "x" }, said)).toBe(false);
    expect(correctionFits({ wrong: "I went", right: "i went.", why: "x" }, "I went home")).toBe(false);
    expect(correctionFits({ wrong: "...", right: "I went", why: "x" }, said)).toBe(false);
  });

  it("tolerates small reordering when every word was said", () => {
    expect(correctionFits({ wrong: "am went I", right: "I went", why: "x" }, said)).toBe(true);
  });
});

describe("coach tips", () => {
  it("reads a tense tip and drops a malformed one", () => {
    const out = parseCoachOutput(
      JSON.stringify({
        reply: "Oh, the mountains! What were you doing when the storm started?",
        correction: null,
        tip: { title: "Was + -ing", text: "Use **was + -ing** for an action in progress.", ru: "Was + -ing — действие в процессе.", examples: ["✓ I was walking", "✗ I was walked home"] },
      }),
    );
    expect(out?.tip).toEqual({
      title: "Was + -ing",
      text: "Use **was + -ing** for an action in progress.",
      ru: "Was + -ing — действие в процессе.",
      examples: ["✓ I was walking"],
    });
    expect(parseCoachOutput(JSON.stringify({ reply: "Hi! Why?", tip: { title: "" } }))?.tip).toBeNull();
    const many = parseCoachOutput(JSON.stringify({ reply: "Hi! Why?", tip: { title: "T", text: "X.", examples: ["a", "b", "c", "d", "e"] } }));
    expect(many?.tip?.examples).toEqual(["a", "b", "c"]);
    const one = parseCoachOutput(JSON.stringify({ reply: "Hi! Why?", tip: { title: "T", text: "X.", ru: null, examples: "✓ I went" } }));
    expect(one?.tip).toEqual({ title: "T", text: "X.", examples: ["✓ I went"] });
  });
});

describe("tip safety", () => {
  it("drops a ✗ example that has no ✓ fix right after it", () => {
    expect(pairExamples(["✗ I was went", "✓ I went", "✗ we was cook"])).toEqual(["✗ I was went", "✓ I went"]);
    expect(pairExamples(["≠ If I knew = now", "✓ If I had known"])).toEqual(["≠ If I knew = now", "✓ If I had known"]);
  });
  it("rewrites the over-simplified be rule", () => {
    expect(fixBeRule("Was goes only with -ing or V3.")).not.toContain("only with -ing or V3");
    expect(fixBeRule("Am goes only with -ing or V3. Work is a verb.")).toContain("adjective");
    expect(fixBeRule("Remember: was goes with -ing or V3, so just say I went.")).toBe(
      "Remember: be goes with -ing, V3 (passive), or an adjective, noun or place, never right before a normal verb, so just say I went.",
    );
    const full = "Be goes with -ing or V3 for the passive, or an adjective or place.";
    expect(fixBeRule(full)).toBe(full);
  });
  it("parses the examiner's JSON", () => {
    expect(parseCoachAnalysis('{"correction":null,"tip":{"title":"T","text":"X."}}')).toEqual({ correction: null, tip: { title: "T", text: "X." } });
    expect(parseCoachAnalysis("no json here")).toBeNull();
  });
});

describe("repeat escalation", () => {
  const c = { wrong: "i am agree", right: "I agree", why: "Don't put am right before a normal verb.", type: "extra-be" };
  it("leaves a first mistake alone and counts repeats in code", () => {
    expect(escalate(c, [])).toEqual(c);
    expect(escalate(c, [{ type: "extra-be" }]).why).toBe("Again (2nd time): don't put am right before a normal verb.");
    expect(escalate(c, [{ type: "extra-be" }, { type: "if-will" }, { type: "extra-be" }]).why).toMatch(/^Again \(3rd time\): /);
    expect(escalate({ ...c, why: "Again a be-error: no am." }, [{ type: "extra-be" }]).why).toBe("Again (2nd time): no am.");
    expect(escalate({ ...c, type: "other" }, [{ type: "other" }])).toEqual({ ...c, type: "other" });
  });
  it("normalises the error family label", () => {
    expect(normalizeErrorType(" Extra Be ")).toBe("extra-be");
    expect(normalizeErrorType(5)).toBeUndefined();
  });
});
