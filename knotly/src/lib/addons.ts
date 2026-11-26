// src/lib/addons.ts — couple add-ons: what a checkout should contain and cost.
// Pure functions (no database, no Stripe) so the rules can be tested on their own.

export type AddonKey =
  | "website"
  | "rsvp"
  | "registry"
  | "invitations"
  | "seating"
  | "photo_share"
  | "thank_you";
export type BundleKey = "bundle_essentials" | "bundle_all";

export type CatalogItem = {
  key: string;
  name: string;
  blurb: string;
  price_cents: number;
  kind: "one_time" | "bundle";
  includes: string[];
  requires: string[];
  active: boolean;
  sort: number;
};

/** Dashboard route for each add-on once it's unlocked (added as each one is built). */
export const ADDON_ROUTES: Partial<Record<AddonKey, string>> = {
  website: "/client/dashboard/website",
  rsvp: "/client/dashboard/rsvp",
  registry: "/client/dashboard/registry",
  invitations: "/client/dashboard/invitations",
  seating: "/client/dashboard/seating",
  photo_share: "/client/dashboard/photos",
  thank_you: "/client/dashboard/thank-you",
};

export type Cart = {
  /** What goes in the Checkout Session metadata and is granted by the webhook. */
  keys: string[];
  /** Stripe line items, priced on the server from the catalog. */
  lines: { key: string; name: string; amount_cents: number }[];
  total_cents: number;
  /** Paid add-ons added automatically because something in the cart needs them. */
  addedForYou: string[];
};

export type CartResult = { ok: true; cart: Cart } | { ok: false; error: string };

export const formatUsd = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;

/**
 * Build a cart from what the couple tapped. Either one bundle, or one or more add-ons.
 * Requirements are added, owned add-ons are dropped, and a bundle is credited for what's already owned.
 */
export function buildCart(catalog: CatalogItem[], wanted: string[], owned: string[]): CartResult {
  const byKey = new Map(catalog.filter((c) => c.active).map((c) => [c.key, c]));
  const have = new Set(owned);
  const picked = [...new Set(wanted)];
  if (!picked.length) return { ok: false, error: "Pick an add-on first." };
  const unknown = picked.find((k) => !byKey.has(k));
  if (unknown) return { ok: false, error: "That add-on isn't available." };

  const bundles = picked.filter((k) => byKey.get(k)!.kind === "bundle");
  if (bundles.length > 1 || (bundles.length === 1 && picked.length > 1)) {
    return { ok: false, error: "Choose one bundle, or individual add-ons." };
  }

  if (bundles.length === 1) {
    const b = byKey.get(bundles[0])!;
    const missing = b.includes.filter((k) => !have.has(k));
    if (!missing.length) return { ok: false, error: "You already have everything in this bundle." };
    const credit = b.includes.filter((k) => have.has(k)).reduce((s, k) => s + (byKey.get(k)?.price_cents ?? 0), 0);
    const amount = Math.max(0, b.price_cents - credit);
    return {
      ok: true,
      cart: {
        keys: [b.key],
        lines: [{ key: b.key, name: credit ? `${b.name} (credit for what you own)` : b.name, amount_cents: amount }],
        total_cents: amount,
        addedForYou: [],
      },
    };
  }

  // Individual add-ons plus whatever they need (requirements of requirements too).
  const keys: string[] = [];
  const addedForYou: string[] = [];
  const visit = (k: string, asked: boolean) => {
    const item = byKey.get(k);
    if (!item || item.kind !== "one_time" || have.has(k) || keys.includes(k)) return;
    for (const r of item.requires) visit(r, false);
    keys.push(k);
    if (!asked && !picked.includes(k)) addedForYou.push(k);
  };
  for (const k of picked) visit(k, true);

  if (!keys.length) return { ok: false, error: "You already have this add-on." };
  const lines = keys.map((k) => ({ key: k, name: byKey.get(k)!.name, amount_cents: byKey.get(k)!.price_cents }));
  return { ok: true, cart: { keys, lines, total_cents: lines.reduce((s, l) => s + l.amount_cents, 0), addedForYou } };
}

/** The cheapest bundle that covers this cart and costs less than buying it piece by piece, if any. */
export function betterBundle(catalog: CatalogItem[], cart: Cart, owned: string[]): { key: string; total_cents: number } | null {
  let best: { key: string; total_cents: number } | null = null;
  for (const b of catalog.filter((c) => c.active && c.kind === "bundle")) {
    if (!cart.keys.every((k) => b.includes.includes(k))) continue;
    const r = buildCart(catalog, [b.key], owned);
    if (!r.ok || r.cart.total_cents >= cart.total_cents) continue;
    if (!best || r.cart.total_cents < best.total_cents) best = { key: b.key, total_cents: r.cart.total_cents };
  }
  return best;
}
