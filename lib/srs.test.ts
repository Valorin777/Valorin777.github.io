import { describe, expect, it } from "vitest";
import { dueSorted, formatInterval, GRADES, isDue, newSrs, previewInterval, review } from "@/lib/srs";
import type { Grade } from "@/lib/srs";
import type { SrsState } from "@/types/state";

const D0 = "2026-10-19";

function run(grades: Grade[], start = D0): SrsState[] {
  const out: SrsState[] = [];
  let s = newSrs(start);
  let day = start;
  for (const g of grades) {
    s = review(s, g, day);
    out.push(s);
    day = s.due;
  }
  return out;
}

describe("newSrs", () => {
  it("starts new and due today", () => {
    expect(newSrs(D0)).toEqual({ ef: 2.5, interval: 0, reps: 0, due: D0, lapses: 0 });
  });
});

describe("review (SM-2)", () => {
  it("Good, Good, Good gives 1, 6, 15 days with ef unchanged", () => {
    const steps = run([4, 4, 4]);
    expect(steps.map((s) => s.interval)).toEqual([1, 6, 15]);
    expect(steps.map((s) => s.ef)).toEqual([2.5, 2.5, 2.5]);
    expect(steps.map((s) => s.due)).toEqual(["2026-10-20", "2026-10-26", "2026-11-10"]);
  });

  it("Easy x3 grows ef by 0.1 each time; the third interval uses the ef before the review", () => {
    const steps = run([5, 5, 5]);
    expect(steps.map((s) => s.interval)).toEqual([1, 6, 16]);
    expect(steps.map((s) => s.ef)).toEqual([2.6, 2.7, 2.8]);
    expect(steps.map((s) => s.reps)).toEqual([1, 2, 3]);
  });

  it("Hard lowers ef but still passes", () => {
    const [s] = run([3]);
    expect(s.ef).toBeCloseTo(2.36);
    expect(s.reps).toBe(1);
    expect(s.interval).toBe(1);
  });

  it("a lapse resets reps and interval and counts a lapse", () => {
    const steps = run([4, 4, 1]);
    const lapsed = steps[2];
    expect(lapsed.reps).toBe(0);
    expect(lapsed.interval).toBe(1);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.ef).toBeCloseTo(1.96);
    expect(lapsed.due).toBe("2026-10-27");
  });

  it("failing a card that was never learned is not a lapse", () => {
    const [s] = run([0]);
    expect(s.lapses).toBe(0);
    expect(s.reps).toBe(0);
    expect(s.interval).toBe(1);
  });

  it("ef never drops below 1.3", () => {
    const steps = run([0, 0, 0, 0, 0]);
    expect(steps[steps.length - 1].ef).toBe(1.3);
    expect(steps.every((s) => s.ef >= 1.3)).toBe(true);
  });

  it("keeps extra fields and does not mutate the input", () => {
    const card = { ...newSrs(D0), id: "m:x", front: "f" };
    const next = review(card, 4, D0);
    expect(next.id).toBe("m:x");
    expect(next.front).toBe("f");
    expect(card.reps).toBe(0);
  });
});

describe("previewInterval", () => {
  it("predicts the interval review would give", () => {
    const learned: SrsState = { ef: 2.5, interval: 6, reps: 2, due: D0, lapses: 0 };
    expect(previewInterval(learned, 1)).toBe(1);
    expect(previewInterval(learned, 3)).toBe(15);
    expect(previewInterval(learned, 5)).toBe(15);
    expect(previewInterval(newSrs(D0), 5)).toBe(1);
    for (const { grade } of GRADES) expect(previewInterval(learned, grade)).toBe(review(learned, grade, D0).interval);
  });
});

describe("isDue and dueSorted", () => {
  const a = { ...newSrs("2026-10-17"), id: "a", ef: 2.5 };
  const b = { ...newSrs("2026-10-19"), id: "b", ef: 2.0 };
  const c = { ...newSrs("2026-10-17"), id: "c", ef: 1.5 };
  const future = { ...newSrs("2026-10-25"), id: "f", ef: 1.3 };

  it("is due on or after the due day", () => {
    expect(isDue(b, "2026-10-19")).toBe(true);
    expect(isDue(b, "2026-10-18")).toBe(false);
    expect(isDue(future, "2026-10-19")).toBe(false);
  });

  it("keeps due cards only, oldest first then lowest ef", () => {
    expect(dueSorted([b, future, a, c], "2026-10-19").map((x) => x.id)).toEqual(["c", "a", "b"]);
  });
});

describe("GRADES and formatInterval", () => {
  it("maps the four buttons to keys 1-4", () => {
    expect(GRADES.map((g) => [g.grade, g.label, g.key])).toEqual([
      [1, "Again", "1"],
      [3, "Hard", "2"],
      [4, "Good", "3"],
      [5, "Easy", "4"],
    ]);
  });

  it("formats intervals", () => {
    expect(formatInterval(0)).toBe("today");
    expect(formatInterval(1)).toBe("1 day");
    expect(formatInterval(6)).toBe("6 days");
    expect(formatInterval(13)).toBe("13 days");
    expect(formatInterval(21)).toBe("3 wk");
    expect(formatInterval(60)).toBe("2 mo");
    expect(formatInterval(400)).toBe("1.1 yr");
  });
});
