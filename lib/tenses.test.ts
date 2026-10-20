import { describe, expect, it } from "vitest";
import { getTense, TENSE_MAP, TENSES } from "@/content/tenses";
import { TENSE_IDS } from "@/content/tenses/ids";
import { initialState, recordAnswer } from "@/lib/progress";
import { tenseSpokenTexts } from "@/lib/sentences";
import { tenseProblems } from "../scripts/validate-tense";
import { TENSE_DAY, tenseExercise, tenseExerciseKey, tenseProgress } from "./tenses";

describe("tense reference", () => {
  it("has every listed entry, valid and in order", () => {
    expect(TENSES.map((t) => t.id)).toEqual([...TENSE_IDS]);
    for (const t of TENSES) expect(tenseProblems(t, t.id)).toEqual([]);
  });

  it("the tense map points at real entries", () => {
    for (const row of TENSE_MAP) for (const id of row.cells) expect(getTense(id)).not.toBeNull();
  });

  it("every entry has English lines to read aloud", () => {
    for (const t of TENSES) expect(tenseSpokenTexts(t).length).toBeGreaterThan(20);
  });

  it("practice answers count per entry and never clash with lesson keys", () => {
    const t = TENSES[0]!;
    const [first, second] = t.exercises;
    expect(tenseExercise(t, first!).id).toBe(tenseExerciseKey(t.id, first!.id));
    let s = initialState();
    expect(tenseProgress(s, t)).toEqual({ right: 0, total: t.exercises.length });
    const answer = (id: string, correct: boolean) =>
      (s = recordAnswer(s, {
        day: TENSE_DAY,
        key: tenseExerciseKey(t.id, id),
        correct,
        category: t.category,
        prompt: "p",
        given: "g",
        right: "r",
        rule: "rule",
        nowIso: "2026-10-20T10:00:00.000Z",
        today: "2026-10-20",
      }));
    answer(first!.id, true);
    answer(second!.id, false);
    expect(tenseProgress(s, t).right).toBe(1);
    expect(s.cards[`m:${tenseExerciseKey(t.id, second!.id)}`]).toBeDefined();
  });
});
