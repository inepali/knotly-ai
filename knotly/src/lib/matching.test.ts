import { describe, it, expect } from "vitest";
import { PRO_WEIGHT, waveSize, weightedShuffle } from "./matching";

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

describe("weightedShuffle", () => {
  it("keeps every item exactly once", () => {
    const out = weightedShuffle([1, 2, 3, 4, 5], undefined, seeded(1));
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("is repeatable with the same random source", () => {
    expect(weightedShuffle(["a", "b", "c", "d"], undefined, seeded(7))).toEqual(
      weightedShuffle(["a", "b", "c", "d"], undefined, seeded(7))
    );
  });

  it("favors heavier items without guaranteeing them first", () => {
    const rng = seeded(42);
    let proFirst = 0;
    const runs = 2000;
    for (let i = 0; i < runs; i++) {
      const [first] = weightedShuffle(["pro", "free"], (v) => (v === "pro" ? PRO_WEIGHT : 1), rng);
      if (first === "pro") proFirst++;
    }
    // expected share = 1.5 / 2.5 = 60%
    expect(proFirst / runs).toBeGreaterThan(0.55);
    expect(proFirst / runs).toBeLessThan(0.65);
  });

  it("copes with an empty list and a zero weight", () => {
    expect(weightedShuffle([])).toEqual([]);
    expect(weightedShuffle(["a", "b"], () => 0)).toHaveLength(2);
  });
});

describe("waveSize", () => {
  it("fills the cap, minus estimates and agents still working", () => {
    expect(waveSize(5, 0, 0, 20)).toBe(5);
    expect(waveSize(5, 2, 1, 20)).toBe(2);
  });
  it("stops at the cap and at the end of the queue", () => {
    expect(waveSize(5, 5, 0, 20)).toBe(0);
    expect(waveSize(5, 6, 0, 20)).toBe(0);
    expect(waveSize(5, 0, 0, 3)).toBe(3);
    expect(waveSize(5, 0, 0, 0)).toBe(0);
  });
});
