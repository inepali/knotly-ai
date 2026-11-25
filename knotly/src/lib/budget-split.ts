// src/lib/budget-split.ts — the default budget split. No AI: each category gets a share of
// the total in proportion to a typical weight, over just the categories the couple needs.
// Rough US-wedding proportions; the couple edits any line afterwards.

const WEIGHTS: Record<string, number> = {
  venue: 30,
  caterer: 20,
  photographer: 10,
  videographer: 5,
  wedding_planner: 8,
  day_of_coordinator: 4,
  dj: 5,
  live_band: 7,
  florist: 6,
  stylist: 4,
  baker: 2,
  dessert: 1,
  bartending: 3,
  bridal_boutique: 5,
  hair_stylist: 2,
  makeup_artist: 2,
  event_rental: 4,
  tent_rental: 3,
};
const DEFAULT_WEIGHT = 2;

/** Whole-USD amounts per category that add up to exactly `total` (largest share absorbs rounding). */
export function defaultBudgetSplit(total: number, categories: string[]): { category: string; amount: number }[] {
  const cats = [...new Set(categories)];
  if (!cats.length || !(total > 0)) return [];
  const weights = cats.map((c) => WEIGHTS[c] ?? DEFAULT_WEIGHT);
  const sum = weights.reduce((a, b) => a + b, 0);
  const amounts = weights.map((w) => Math.floor((total * w) / sum));
  const biggest = weights.indexOf(Math.max(...weights));
  amounts[biggest] += total - amounts.reduce((a, b) => a + b, 0);
  return cats.map((category, i) => ({ category, amount: amounts[i] }));
}
