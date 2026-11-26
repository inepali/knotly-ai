// src/lib/listing.ts — the public listing pages: /wedding-vendors/[city] (every category in a city)
// and /wedding-vendors/[city]/[category] (one category in a city). Addresses, copy, ordering, the
// "enough vendors to index" rule and structured data. Pure functions, so they're easy to test.
// See docs/specs/seo-listing-pages-spec.md.
import { categoryParam } from "@/lib/vendor-seo";
import type { CategorySlug } from "@/lib/categories";
import { SITE_NAME } from "@/lib/site";

/** Below this many vendors a listing page still works but is kept out of search (thin content). */
export const MIN_INDEXABLE_VENDORS = 3;

export const isIndexable = (vendorCount: number) => vendorCount >= MIN_INDEXABLE_VENDORS;

/** What couples type into Google, used in headings and titles. Typed so a new category can't be forgotten. */
const LISTING_NOUNS: Record<CategorySlug, string> = {
  wedding_planner: "Wedding Planners",
  day_of_coordinator: "Day-of Coordinators",
  stylist: "Wedding Stylists",
  venue: "Wedding Venues",
  caterer: "Wedding Caterers",
  bartending: "Wedding Bartenders",
  baker: "Wedding Cake Bakers",
  dessert: "Wedding Dessert Vendors",
  photographer: "Wedding Photographers",
  videographer: "Wedding Videographers",
  content_creator: "Wedding Content Creators",
  photo_booth: "Wedding Photo Booths",
  photo_editor: "Wedding Photo Editors",
  video_editor: "Wedding Video Editors",
  dj: "Wedding DJs",
  mc: "Wedding MCs",
  live_band: "Wedding Bands",
  ceremony_musicians: "Ceremony & Cocktail Musicians",
  live_entertainer: "Wedding Entertainers",
  florist: "Wedding Florists",
  event_rental: "Event Rentals",
  tent_rental: "Tent Rentals",
  bridal_boutique: "Bridal Boutiques",
  tuxedo_rental: "Tuxedo Rentals",
  seamstress: "Bridal Seamstresses",
  hair_stylist: "Wedding Hair Stylists",
  makeup_artist: "Wedding Makeup Artists",
  calligrapher: "Wedding Calligraphers",
  transportation: "Wedding Transportation",
  wedding_officiant: "Wedding Officiants",
  jeweler: "Wedding Jewelers",
  valet_parking: "Wedding Valet Parking",
  security: "Wedding Security Services",
  audio_guestbook: "Audio Guestbooks",
  live_painter: "Live Wedding Painters",
};

/** photographer -> "Wedding Photographers". */
export const listingNoun = (category: string) =>
  (LISTING_NOUNS as Record<string, string>)[category] ?? `Wedding ${category.replace(/_/g, " ")}`;

export const cityPath = (metro: string) => `/wedding-vendors/${metro}`;
export const listingPath = (metro: string, category: string) => `${cityPath(metro)}/${categoryParam(category)}`;

export type City = { slug: string; name: string; state: string; lat?: number; lng?: number };
export const placeName = (c: { name: string; state: string }) => `${c.name}, ${c.state}`;

/** Today's date in Charlotte time, e.g. "2026-11-26". The vendor order changes once a day. */
export function dailySeed(now = new Date(), timeZone = "America/New_York") {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** 32-bit FNV-1a hash. */
function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Same order all day, a new order tomorrow, so every vendor takes turns near the top.
 * Each item's position depends only on its own key and the seed: adding a vendor doesn't reshuffle the rest.
 */
export function seededShuffle<T>(items: T[], seed: string, key: (item: T) => string): T[] {
  return items
    .map((item) => ({ item, k: hash(`${seed}:${key(item)}`) }))
    .sort((a, b) => a.k - b.k || key(a.item).localeCompare(key(b.item)))
    .map((x) => x.item);
}

export type PriceStats = { low: number; median: number; high: number; count: number };

/** Starting-price spread across vendors, or null when there are too few to say anything fair. */
export function priceStats(prices: (number | null | undefined)[], min = MIN_INDEXABLE_VENDORS): PriceStats | null {
  const p = prices.filter((x): x is number => typeof x === "number" && x > 0).sort((a, b) => a - b);
  if (p.length < min) return null;
  const mid = Math.floor(p.length / 2);
  const median = p.length % 2 ? p[mid] : Math.round((p[mid - 1] + p[mid]) / 2);
  return { low: p[0], median, high: p[p.length - 1], count: p.length };
}

export const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/** "Wedding DJs" -> "wedding DJs": lower-case for use mid-sentence, keeping acronyms. */
export const lowerNoun = (noun: string) =>
  noun
    .split(" ")
    .map((w) => (/[A-Z]{2}/.test(w) ? w : w.toLowerCase()))
    .join(" ");

/** Heading, search title and description for a city + category page. */
export function listingCopy(o: { category: string; city: { name: string; state: string }; count: number; stats: PriceStats | null; year: number }) {
  const noun = listingNoun(o.category);
  const place = placeName(o.city);
  const h1 = `${noun} in ${place}`;
  const title = isIndexable(o.count) ? `${o.count} ${noun} in ${place} (${o.year}) | ${SITE_NAME}` : `${h1} | ${SITE_NAME}`;
  const range = o.stats ? ` Starting prices run from ${usd(o.stats.low)} to ${usd(o.stats.high)}.` : "";
  const intro =
    o.count > 0
      ? `Compare ${o.count} ${lowerNoun(noun)} serving ${o.city.name}.${range} Post your wedding once and get up to 5 free estimates from vendors who are free on your date and fit your budget.`
      : `We're still adding ${lowerNoun(noun)} in ${o.city.name}. Post your wedding and we'll send it to vendors as they join.`;
  return { noun, place, h1, title, description: intro.length > 160 ? `${intro.slice(0, 157).replace(/\s+\S*$/, "")}…` : intro, intro };
}

/** Questions couples actually search, answered with this page's real numbers. */
export function listingFaq(o: { category: string; city: { name: string; state: string }; stats: PriceStats | null }) {
  const noun = lowerNoun(listingNoun(o.category));
  const faq = [
    {
      q: `How do I find ${noun} in ${o.city.name}?`,
      a: `Post your wedding details on ${SITE_NAME} once: your date, city and budget. ${listingNoun(o.category)} who are free that day and fit your budget send you estimates, so you don't have to contact each one.`,
    },
    {
      q: `Is it free to get estimates?`,
      a: `Yes. Posting your wedding and receiving estimates is free for couples. You get up to 5 estimates per category, and you can ask for more.`,
    },
  ];
  if (o.stats) {
    faq.unshift({
      q: `How much do ${noun} cost in ${o.city.name}?`,
      a: `On ${SITE_NAME}, starting packages for ${noun} serving ${placeName(o.city)} range from ${usd(o.stats.low)} to ${usd(o.stats.high)}, with a typical starting price around ${usd(o.stats.median)}. Your estimate depends on your date, hours and guest count.`,
    });
  }
  return faq;
}

const SLUG = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

/**
 * Where a couple who signed up from a listing page lands: My Wedding with the city and vendor type
 * from the listing filled in. Only well-formed values pass through (the page checks them for real);
 * null when there's nothing to prefill.
 */
export function weddingPrefillPath(metro?: string | null, need?: string | null) {
  const q = new URLSearchParams();
  if (metro && SLUG.test(metro)) q.set("metro", metro);
  if (need && SLUG.test(need)) q.set("need", need.replace(/-/g, "_"));
  return q.size ? `/client/dashboard/my-wedding?${q}` : null;
}

/** Closest other cities first (straight-line distance), for "nearby" links. */
export function nearbyCities(from: City, cities: City[], n = 5): City[] {
  if (from.lat == null || from.lng == null) return cities.filter((c) => c.slug !== from.slug).slice(0, n);
  const rad = (d: number) => (d * Math.PI) / 180;
  const dist = (c: City) => {
    if (c.lat == null || c.lng == null) return Infinity;
    const dLat = rad(c.lat - from.lat!);
    const dLng = rad(c.lng - from.lng!);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from.lat!)) * Math.cos(rad(c.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * Math.asin(Math.sqrt(a));
  };
  return cities
    .filter((c) => c.slug !== from.slug)
    .map((c) => ({ c, d: dist(c) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((x) => x.c);
}

/** Count vendors per category, in the order of `order` (the display order of categories). */
export function countByCategory(rows: { category: string }[], order: readonly string[]) {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  return order.filter((c) => counts.has(c)).map((category) => ({ category, count: counts.get(category)! }));
}

type Crumb = { name: string; url: string };

const breadcrumbList = (crumbs: Crumb[]) => ({
  "@type": "BreadcrumbList",
  itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.url })),
});

/** Breadcrumbs plus the list of vendors on the page, for search engines. */
export function listingJsonLd(o: { crumbs: Crumb[]; name: string; url: string; items: { name: string; url: string }[] }) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      breadcrumbList(o.crumbs),
      {
        "@type": "ItemList",
        "@id": `${o.url}#list`,
        name: o.name,
        url: o.url,
        numberOfItems: o.items.length,
        itemListElement: o.items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, url: it.url })),
      },
    ],
  };
}
