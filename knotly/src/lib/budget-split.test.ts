import { describe, it, expect } from "vitest";
import { defaultBudgetSplit } from "./budget-split";

describe("defaultBudgetSplit", () => {
  it("adds up to exactly the total", () => {
    for (const total of [1, 999, 25_000, 33_333]) {
      const split = defaultBudgetSplit(total, ["venue", "caterer", "photographer", "dj", "florist"]);
      expect(split.reduce((s, x) => s + x.amount, 0)).toBe(total);
    }
  });

  it("gives bigger shares to venue and catering", () => {
    const [venue, photo] = defaultBudgetSplit(20_000, ["venue", "photographer"]);
    expect(venue.amount).toBeGreaterThan(photo.amount);
  });

  it("uses a default weight for unknown categories and ignores duplicates", () => {
    const split = defaultBudgetSplit(1000, ["calligrapher", "calligrapher"]);
    expect(split).toEqual([{ category: "calligrapher", amount: 1000 }]);
  });

  it("returns nothing without a total or any categories", () => {
    expect(defaultBudgetSplit(0, ["venue"])).toEqual([]);
    expect(defaultBudgetSplit(5000, [])).toEqual([]);
  });
});
