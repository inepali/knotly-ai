// src/lib/matching.ts — who gets asked first when more vendors match than the estimate cap.
// Pure, so it's easy to test. The order is stored on the threads (queue_rank) so a wave can
// be replayed exactly.

/** Extra weight for Pro subscribers. Billing is a later spec; until then nobody is Pro. */
export const PRO_WEIGHT = 1.5;

export type Rng = () => number;

/**
 * Weighted random order (Efraimidis-Spirakis): every item draws a random key u^(1/weight)
 * and the biggest keys go first. Higher weight = more likely to come early, but nobody is
 * guaranteed first or starved, so new vendors still get asked.
 */
export function weightedShuffle<T>(items: T[], weight: (item: T) => number = () => 1, rng: Rng = Math.random): T[] {
  return items
    .map((item) => ({ item, key: Math.pow(rng() || Number.MIN_VALUE, 1 / Math.max(weight(item), 0.0001)) }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.item);
}

/**
 * How many more vendors to ask right now: the cap minus estimates already sent and agents
 * still working, never negative and never more than are waiting.
 */
export function waveSize(cap: number, estimates: number, inFlight: number, queued: number) {
  return Math.max(0, Math.min(cap - estimates - inFlight, queued));
}
