import { describe, expect, it } from "vitest";
import { addDays, diffDays, isDay, today } from "@/lib/date";

describe("today", () => {
  it("formats the local calendar day with zero padding", () => {
    expect(today(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(today(new Date(2026, 11, 31, 0, 1))).toBe("2026-12-31");
  });

  it("defaults to now", () => {
    expect(isDay(today())).toBe(true);
  });
});

describe("addDays", () => {
  it("crosses month, leap day and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-10-19", 0)).toBe("2026-10-19");
  });

  it("is not skewed by daylight saving changes", () => {
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
  });

  it("returns a malformed day unchanged", () => {
    expect(addDays("not a day", 3)).toBe("not a day");
  });
});

describe("diffDays", () => {
  it("counts whole days, signed", () => {
    expect(diffDays("2026-10-19", "2026-10-20")).toBe(1);
    expect(diffDays("2026-10-20", "2026-10-19")).toBe(-1);
    expect(diffDays("2026-03-28", "2026-03-30")).toBe(2);
    expect(diffDays("2026-12-31", "2027-01-01")).toBe(1);
    expect(diffDays("2024-01-01", "2025-01-01")).toBe(366);
  });

  it("is NaN for malformed input", () => {
    expect(diffDays("2026-1-1", "2026-01-02")).toBeNaN();
  });
});

describe("isDay", () => {
  it("accepts real days only", () => {
    expect(isDay("2024-02-29")).toBe(true);
    expect(isDay("2026-02-29")).toBe(false);
    expect(isDay("2026-13-01")).toBe(false);
    expect(isDay(20261019)).toBe(false);
  });
});
