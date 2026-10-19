import { describe, expect, it } from "vitest";
import { audioKey, audioText } from "./audioKey";

describe("audio keys", () => {
  it("cleans markup and spacing", () => {
    expect(audioText("  I **agree**  with you. ")).toBe("I agree with you.");
    expect(audioText("The film ___ at eight.")).toBe("The film blank at eight.");
  });
  it("is stable and voice-specific", () => {
    const a = audioKey("I agree with you.", "oa-marin");
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(audioKey("I  **agree** with you.", "oa-marin")).toBe(a);
    expect(audioKey("I agree with you.", "oa-coral")).not.toBe(a);
    expect(audioKey("I agree with you!", "oa-marin")).not.toBe(a);
  });
});

import { joinWords } from "./sentences";
describe("joinWords", () => {
  it("does not put spaces before contractions or punctuation", () => {
    expect(joinWords(["I live here, but this month I ", "'m staying", " with my parents."])).toBe(
      "I live here, but this month I'm staying with my parents.",
    );
    expect(joinWords(["She", "does", "n't", "know", "."])).toBe("She doesn't know.");
  });
});
