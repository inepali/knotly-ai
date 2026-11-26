// src/app/sitemap.ts — /sitemap.xml: the home page, the listing pages that have enough vendors to
// be indexed (see MIN_INDEXABLE_VENDORS), and every public vendor's page.
import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { vendorPath } from "@/lib/vendor-seo";
import { cityPath, isIndexable, listingPath } from "@/lib/listing";
import { listedVendors } from "@/lib/public-listing";

export const dynamic = "force-dynamic"; // read the current vendors on each request

type Entry = MetadataRoute.Sitemap[number];

const latest = (dates: (string | null)[]) => {
  const t = Math.max(...dates.map((d) => (d ? Date.parse(d) : 0)));
  return t > 0 ? new Date(t) : undefined;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const home: Entry = { url: base, changeFrequency: "weekly", priority: 1 };
  const rows = await listedVendors(null); // [] if the listing migration hasn't run yet
  if (!rows.length) return [home];

  // Listing pages: one per (city, category) with enough vendors.
  const listings = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.listing_metro}|${r.category}`;
    listings.set(key, [...(listings.get(key) ?? []), r]);
  }
  const indexable = [...listings.values()].filter((group) => isIndexable(group.length));
  const listingPages: Entry[] = indexable.map((group) => ({
    url: `${base}${listingPath(group[0].listing_metro, group[0].category)}`,
    lastModified: latest(group.map((r) => r.updated_at)),
    changeFrequency: "daily",
    priority: 0.8,
  }));

  // City pages: any city with at least one indexable category page.
  const cities = [...new Set(indexable.map((group) => group[0].listing_metro))];
  const cityPages: Entry[] = cities.map((slug) => ({ url: `${base}${cityPath(slug)}`, changeFrequency: "daily", priority: 0.8 }));
  const index: Entry[] = cities.length ? [{ url: `${base}/wedding-vendors`, changeFrequency: "weekly", priority: 0.6 }] : [];

  // Vendor pages: each public vendor once (they appear in several cities' listings).
  const seen = new Set<string>();
  const vendorPages: Entry[] = rows.flatMap((r) => {
    if (seen.has(r.vendor_id)) return [];
    seen.add(r.vendor_id);
    const path = vendorPath({ slug: r.slug, metro_slug: r.home_metro, category: r.category });
    return path
      ? [{ url: `${base}${path}`, lastModified: r.updated_at ? new Date(r.updated_at) : undefined, changeFrequency: "weekly" as const, priority: 0.7 }]
      : [];
  });

  return [home, ...index, ...cityPages, ...listingPages, ...vendorPages];
}
