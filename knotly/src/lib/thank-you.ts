// src/lib/thank-you.ts — Thank-You Tracker helpers: matching a registry name to a household,
// counts, address labels and CSV. No database here.
import { toCsv, type Address } from "./guests";

export type Gift = {
  id: string;
  household_id: string | null;
  giver: string | null;
  description: string;
  amount_cents: number | null;
  received_on: string | null;
  thanked_on: string | null;
  notes: string | null;
  source: "manual" | "registry_claim" | "gift_note";
};
export type TyHousehold = { id: string; label: string; address: Address; guests: { first_name: string; last_name: string }[] };

const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Which household a typed name belongs to: an exact household label, or a guest's full name.
 * Only a single, unambiguous match counts; otherwise the gift keeps the name and waits for the couple.
 */
export function matchHousehold(name: string, households: TyHousehold[]): string | null {
  const n = norm(name);
  if (!n) return null;
  const hits = new Set<string>();
  for (const h of households) {
    if (norm(h.label) === n) hits.add(h.id);
    for (const g of h.guests) if (norm(`${g.first_name} ${g.last_name}`) === n) hits.add(h.id);
  }
  if (hits.size === 1) return [...hits][0];
  // "Ravi & Mira", "Ravi and Mira Patel": every first name belongs to the same household.
  const parts = n.split(/ (?:and|&) | /).filter(Boolean);
  if (parts.length >= 2) {
    const firstNameHits = households.filter((h) => parts.filter((p) => h.guests.some((g) => norm(g.first_name) === p)).length >= 2);
    if (firstNameHits.length === 1) return firstNameHits[0].id;
  }
  return null;
}

export function giftCounts(gifts: Gift[]) {
  const thanked = gifts.filter((g) => g.thanked_on).length;
  return { total: gifts.length, thanked, waiting: gifts.length - thanked, unmatched: gifts.filter((g) => !g.household_id).length };
}

/** Mailing lines for a household; null when there's no street address. */
export function addressLines(h: TyHousehold): string[] | null {
  const a = h.address ?? {};
  if (!a.street?.trim()) return null;
  const cityLine = [a.city?.trim(), [a.state?.trim(), a.zip?.trim()].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [h.label, a.street.trim(), cityLine].filter(Boolean);
}

/** Households to label: everyone, or only those with a gift that hasn't been thanked yet. */
export function labelHouseholds(households: TyHousehold[], gifts: Gift[], onlyWaiting: boolean) {
  const waiting = new Set(gifts.filter((g) => !g.thanked_on && g.household_id).map((g) => g.household_id!));
  return households.filter((h) => !onlyWaiting || waiting.has(h.id));
}

export function giftsCsv(gifts: Gift[], households: TyHousehold[]) {
  const byId = new Map(households.map((h) => [h.id, h]));
  return toCsv([
    ["From", "Gift", "Amount", "Received", "Thanked", "Street", "City", "State", "Zip", "Notes"],
    ...gifts.map((g) => {
      const h = g.household_id ? byId.get(g.household_id) : undefined;
      return [
        h?.label ?? g.giver ?? "",
        g.description,
        g.amount_cents != null ? (g.amount_cents / 100).toFixed(2) : "",
        g.received_on ?? "",
        g.thanked_on ?? "",
        h?.address.street ?? "",
        h?.address.city ?? "",
        h?.address.state ?? "",
        h?.address.zip ?? "",
        g.notes ?? "",
      ];
    }),
  ]);
}
