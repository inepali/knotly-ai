// src/app/wedding-vendors/[city]/[category]/page.tsx — one category in one city, e.g.
// /wedding-vendors/charlotte-nc/photographer: the page couples land on from "wedding photographers
// charlotte nc". Lists public vendors who serve the city and sends couples to post their wedding.
// Thin pages (under MIN_INDEXABLE_VENDORS) still work but are kept out of search.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { SITE_NAME, siteUrl } from "@/lib/site";
import { categoryFromParam, categoryParam, jsonLdString, vendorPath } from "@/lib/vendor-seo";
import { VENDOR_CATEGORIES } from "@/lib/categories";
import {
  cityPath,
  countByCategory,
  dailySeed,
  isIndexable,
  listingCopy,
  listingFaq,
  listingJsonLd,
  listingNoun,
  lowerNoun,
  listingPath,
  nearbyCities,
  placeName,
  priceStats,
  seededShuffle,
  usd,
} from "@/lib/listing";
import { allCities, cityBySlug, listedVendors } from "@/lib/public-listing";
import { Breadcrumbs, EstimatesButton, Faq, VendorCard } from "@/components/listing/ListingParts";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { SiteFooter } from "@/components/ui/SiteFooter";

export const dynamic = "force-dynamic"; // the vendor order rotates daily; see dailySeed

type Params = Promise<{ city: string; category: string }>;

async function load(cityParam: string, categoryArg: string) {
  const category = categoryFromParam(categoryArg);
  const city = await cityBySlug(cityParam);
  if (!category || !city) return null;
  const rows = await listedVendors(city.slug);
  const vendors = rows.filter((r) => r.category === category);
  const stats = priceStats(vendors.map((v) => v.min_price));
  const copy = listingCopy({ category, city, count: vendors.length, stats, year: new Date().getFullYear() });
  return { category, city, rows, vendors, stats, copy };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { city, category } = await params;
  const d = await load(city, category);
  if (!d) return { title: "Page not found", robots: { index: false } };
  const url = `${siteUrl()}${listingPath(d.city.slug, d.category)}`;
  return {
    title: d.copy.title,
    description: d.copy.description,
    alternates: { canonical: url },
    robots: isIndexable(d.vendors.length) ? undefined : { index: false, follow: true },
    openGraph: { type: "website", siteName: SITE_NAME, title: d.copy.h1, description: d.copy.description, url },
    twitter: { card: "summary", title: d.copy.h1, description: d.copy.description },
  };
}

export default async function ListingPage({ params }: { params: Params }) {
  const { city: cityArg, category: categoryArg } = await params;
  const d = await load(cityArg, categoryArg);
  if (!d) notFound();
  const { category, city, rows, stats, copy } = d;

  // One address per page: /charlotte-nc/hair_stylist goes to /charlotte-nc/hair-stylist.
  if (categoryArg !== categoryParam(category)) permanentRedirect(listingPath(city.slug, category));

  const cities = await allCities();
  const cityName = new Map(cities.map((c) => [c.slug, c.name]));
  const vendors = seededShuffle(d.vendors, dailySeed(), (v) => v.vendor_id);

  // Same category in nearby cities that have someone to show, and other categories here.
  const everywhere = await listedVendors(null);
  const nearby = nearbyCities(city, cities, 8)
    .filter((c) => everywhere.some((r) => r.listing_metro === c.slug && r.category === category))
    .slice(0, 5);
  const related = countByCategory(rows, VENDOR_CATEGORIES.map((c) => c.slug)).filter((c) => c.category !== category);

  const base = siteUrl();
  const url = `${base}${listingPath(city.slug, category)}`;
  const ld = listingJsonLd({
    crumbs: [
      { name: "Home", url: base },
      { name: `Wedding vendors in ${placeName(city)}`, url: `${base}${cityPath(city.slug)}` },
      { name: copy.h1, url },
    ],
    name: copy.h1,
    url,
    items: vendors.flatMap((v) => {
      const p = vendorPath({ slug: v.slug, metro_slug: v.home_metro, category: v.category });
      return p ? [{ name: v.business_name, url: `${base}${p}` }] : [];
    }),
  });

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-10 px-4 pb-24 sm:px-6">
        <Breadcrumbs
          items={[
            { name: "Home", href: "/" },
            { name: placeName(city), href: cityPath(city.slug) },
            { name: listingNoun(category) },
          ]}
        />

        <header>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{copy.h1}</h1>
          <p className="mt-4 text-lg text-gray-700">{copy.intro}</p>
          <div className="mt-6">
            <EstimatesButton metro={city.slug} category={category} />
          </div>
        </header>

        {vendors.length > 0 ? (
          <section aria-labelledby="vendors">
            <h2 id="vendors" className="sr-only">
              {copy.noun}
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {vendors.map((v) => (
                <VendorCard key={v.vendor_id} v={v} cityName={city.name} homeCityName={cityName.get(v.home_metro)} />
              ))}
            </ul>
          </section>
        ) : (
          <section className="rounded-2xl border border-dashed border-gray-300 p-6 text-gray-700">
            Be the first to get estimates in {city.name}. Post your wedding and we&apos;ll send it to{" "}
            {lowerNoun(copy.noun)} as they join {SITE_NAME}.
          </section>
        )}

        {stats && (
          <section aria-labelledby="prices">
            <h2 id="prices" className="text-xl font-semibold tracking-tight">
              {copy.noun} prices in {city.name}
            </h2>
            <p className="mt-1 text-sm text-gray-600">Starting package prices from {stats.count} vendors on {SITE_NAME}.</p>
            <dl className="mt-4 grid grid-cols-3 gap-4 text-center">
              {[
                ["Lowest", stats.low],
                ["Typical", stats.median],
                ["Highest", stats.high],
              ].map(([label, n]) => (
                <div key={label} className="rounded-xl bg-gray-50 p-4">
                  <dt className="text-sm text-gray-600">{label}</dt>
                  <dd className="mt-1 text-xl font-semibold">{usd(n as number)}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section aria-labelledby="faq">
          <h2 id="faq" className="text-xl font-semibold tracking-tight">
            Questions couples ask
          </h2>
          <Faq items={listingFaq({ category, city, stats })} />
        </section>

        {(nearby.length > 0 || related.length > 0) && (
          <nav aria-label="Related" className="grid gap-8 sm:grid-cols-2">
            {nearby.length > 0 && (
              <div>
                <h2 className="font-semibold">{copy.noun} nearby</h2>
                <ul className="mt-2 space-y-1 text-sm">
                  {nearby.map((c) => (
                    <li key={c.slug}>
                      <Link href={listingPath(c.slug, category)} className="text-cyan-700 hover:underline">
                        {copy.noun} in {placeName(c)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {related.length > 0 && (
              <div>
                <h2 className="font-semibold">More wedding vendors in {city.name}</h2>
                <ul className="mt-2 space-y-1 text-sm">
                  {related.map((c) => (
                    <li key={c.category}>
                      <Link href={listingPath(city.slug, c.category)} className="text-cyan-700 hover:underline">
                        {listingNoun(c.category)} ({c.count})
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </nav>
        )}
      </main>

      {/* Sticky call to action on phones. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 p-3 backdrop-blur sm:hidden">
        <EstimatesButton metro={city.slug} category={category} />
      </div>

      <SiteFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(ld) }} />
    </div>
  );
}
