// src/app/wedding-vendors/[city]/page.tsx — every vendor category in one city, e.g.
// /wedding-vendors/charlotte-nc. Links down to the category pages; indexed once at least one of
// them has enough vendors to be indexed.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE_NAME, siteUrl } from "@/lib/site";
import { VENDOR_CATEGORIES } from "@/lib/categories";
import { jsonLdString } from "@/lib/vendor-seo";
import { cityPath, countByCategory, isIndexable, listingJsonLd, listingNoun, listingPath, lowerNoun, nearbyCities, placeName } from "@/lib/listing";
import { allCities, cityBySlug, listedVendors } from "@/lib/public-listing";
import { Breadcrumbs, EstimatesButton } from "@/components/listing/ListingParts";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { SiteFooter } from "@/components/ui/SiteFooter";

export const dynamic = "force-dynamic";

type Params = Promise<{ city: string }>;

async function load(slug: string) {
  const city = await cityBySlug(slug);
  if (!city) return null;
  const rows = await listedVendors(city.slug);
  const counts = countByCategory(rows, VENDOR_CATEGORIES.map((c) => c.slug));
  const total = new Set(rows.map((r) => r.vendor_id)).size;
  const title = `Wedding Vendors in ${placeName(city)}`;
  const description =
    total > 0
      ? `Find ${total} wedding vendors serving ${city.name}, including ${[...counts]
          .sort((a, b) => b.count - a.count)
          .slice(0, 3)
          .map((c) => lowerNoun(listingNoun(c.category)).replace(/^wedding /, ""))
          .join(", ")}. Post your wedding once and get free estimates.`
      : `Wedding vendors serving ${city.name}. Post your wedding once on ${SITE_NAME} and get free estimates as vendors join.`;
  return { city, counts, total, title, description, indexable: counts.some((c) => isIndexable(c.count)) };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const d = await load((await params).city);
  if (!d) return { title: "Page not found", robots: { index: false } };
  const url = `${siteUrl()}${cityPath(d.city.slug)}`;
  return {
    title: `${d.title} | ${SITE_NAME}`,
    description: d.description,
    alternates: { canonical: url },
    robots: d.indexable ? undefined : { index: false, follow: true },
    openGraph: { type: "website", siteName: SITE_NAME, title: d.title, description: d.description, url },
  };
}

export default async function CityPage({ params }: { params: Params }) {
  const d = await load((await params).city);
  if (!d) notFound();
  const { city, counts } = d;

  // Group the categories that have vendors the way the rest of the app does (Planning, Photo & video, …).
  const groups = new Map<string, typeof counts>();
  for (const c of counts) {
    const group = VENDOR_CATEGORIES.find((x) => x.slug === c.category)?.group ?? "Other";
    groups.set(group, [...(groups.get(group) ?? []), c]);
  }

  const cities = await allCities();
  const everywhere = await listedVendors(null);
  const nearby = nearbyCities(city, cities, 8)
    .filter((c) => everywhere.some((r) => r.listing_metro === c.slug))
    .slice(0, 5);

  const base = siteUrl();
  const url = `${base}${cityPath(city.slug)}`;
  const ld = listingJsonLd({
    crumbs: [
      { name: "Home", url: base },
      { name: d.title, url },
    ],
    name: d.title,
    url,
    items: counts.map((c) => ({ name: `${listingNoun(c.category)} in ${placeName(city)}`, url: `${base}${listingPath(city.slug, c.category)}` })),
  });

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-10 px-4 pb-16 sm:px-6">
        <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: placeName(city) }]} />

        <header>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{d.title}</h1>
          <p className="mt-4 text-lg text-gray-700">{d.description}</p>
          <div className="mt-6">
            <EstimatesButton metro={city.slug} />
          </div>
        </header>

        {counts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-300 p-6 text-gray-700">
            We&apos;re still adding vendors in {city.name}. Post your wedding and we&apos;ll send it to vendors as they join.
          </p>
        ) : (
          <div className="grid gap-8 sm:grid-cols-2">
            {[...groups].map(([group, items]) => (
              <section key={group} aria-labelledby={`g-${group}`}>
                <h2 id={`g-${group}`} className="font-semibold">
                  {group}
                </h2>
                <ul className="mt-2 space-y-1">
                  {items.map((c) => (
                    <li key={c.category}>
                      <Link href={listingPath(city.slug, c.category)} className="text-cyan-700 hover:underline">
                        {listingNoun(c.category)}
                      </Link>{" "}
                      <span className="text-sm text-gray-500">({c.count})</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {nearby.length > 0 && (
          <nav aria-label="Nearby cities">
            <h2 className="font-semibold">Nearby cities</h2>
            <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {nearby.map((c) => (
                <li key={c.slug}>
                  <Link href={cityPath(c.slug)} className="text-cyan-700 hover:underline">
                    Wedding vendors in {placeName(c)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </main>
      <SiteFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(ld) }} />
    </div>
  );
}
