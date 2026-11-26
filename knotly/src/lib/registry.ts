// src/lib/registry.ts — Gift Registry helpers with no database: store names, payment links, counts.

export type FundMethod = { kind: "venmo" | "paypal" | "cashapp" | "zelle" | "honeyfund" | "link"; value: string };
export type RegistryLink = { id: string; store: string; url: string; note: string | null; sort: number };
export type RegistryFund = { id: string; title: string; description: string | null; goal_cents: number | null; methods: FundMethod[]; sort: number };
export type RegistryItem = {
  id: string;
  title: string;
  url: string | null;
  image_url: string | null;
  price_cents: number | null;
  quantity: number;
  note: string | null;
  sort: number;
  claimed: number;
};

export const METHOD_LABELS: Record<FundMethod["kind"], string> = {
  venmo: "Venmo",
  paypal: "PayPal",
  cashapp: "Cash App",
  zelle: "Zelle",
  honeyfund: "Honeyfund",
  link: "Link",
};

const STORES: [RegExp, string][] = [
  [/(^|\.)amazon\./, "Amazon"],
  [/(^|\.)target\.com$/, "Target"],
  [/(^|\.)zola\.com$/, "Zola"],
  [/(^|\.)crateandbarrel\.com$/, "Crate & Barrel"],
  [/(^|\.)williams-sonoma\.com$/, "Williams Sonoma"],
  [/(^|\.)potterybarn\.com$/, "Pottery Barn"],
  [/(^|\.)walmart\.com$/, "Walmart"],
  [/(^|\.)etsy\.com$/, "Etsy"],
  [/(^|\.)theknot\.com$/, "The Knot"],
  [/(^|\.)macys\.com$/, "Macy's"],
  [/(^|\.)rei\.com$/, "REI"],
  [/(^|\.)crateandkids\.com$/, "Crate & Kids"],
];

/** "https://www.target.com/gift-registry/…" → "Target"; otherwise the site's domain. */
export function storeFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return STORES.find(([re]) => re.test(host))?.[1] ?? host;
  } catch {
    return "";
  }
}

const handle = (v: string, prefix: string) => v.trim().replace(new RegExp(`^\\${prefix}`), "").replace(/^@/, "");
const HANDLE_RE = /^[A-Za-z0-9_.-]{1,40}$/;

/** Where a payment method points (or null for Zelle, which has no link), and what to show. */
export function methodLink(m: FundMethod): { href: string | null; text: string } | null {
  const v = m.value.trim();
  switch (m.kind) {
    case "venmo": {
      const h = handle(v, "@");
      return HANDLE_RE.test(h) ? { href: `https://venmo.com/u/${encodeURIComponent(h)}`, text: `@${h}` } : null;
    }
    case "paypal": {
      const h = v.replace(/^https?:\/\/(www\.)?paypal\.me\//i, "").replace(/\/$/, "");
      return HANDLE_RE.test(h) ? { href: `https://paypal.me/${encodeURIComponent(h)}`, text: `paypal.me/${h}` } : null;
    }
    case "cashapp": {
      const h = handle(v, "$");
      return HANDLE_RE.test(h) ? { href: `https://cash.app/$${encodeURIComponent(h)}`, text: `$${h}` } : null;
    }
    case "zelle":
      return v && v.length <= 80 ? { href: null, text: v } : null;
    case "honeyfund":
    case "link":
      return /^https:\/\/[^\s]+$/i.test(v) && v.length <= 500 ? { href: v, text: storeFromUrl(v) || "Open" } : null;
  }
}

export const usd = (cents: number | null | undefined) =>
  cents == null ? "" : `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;

/** "$1,250.50" → 125050; blank → null. */
export function parseUsd(s: string): number | null | undefined {
  const t = s.replace(/[$,\s]/g, "");
  if (!t) return null;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(t)) return undefined;
  return Math.round(Number(t) * 100);
}

export const remaining = (i: Pick<RegistryItem, "quantity" | "claimed">) => Math.max(0, i.quantity - i.claimed);
