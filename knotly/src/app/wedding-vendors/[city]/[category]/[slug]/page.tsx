// src/app/wedding-vendors/[city]/[category]/[slug]/page.tsx — a vendor's public, search-friendly
// page: anyone (and search engines) can read it. Only published vendors have one. The private
// /vendors/[id] page (for couples with an estimate) is separate and stays out of search.
import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { categoryLabel } from "@/lib/categories";
import { SITE_NAME, siteUrl } from "@/lib/site";
import { reviewBadge } from "@/lib/review-requests";
import { jsonLdString, metaDescription, vendorJsonLd, vendorPath } from "@/lib/vendor-seo";
import { cityPath, listingNoun, listingPath, lowerNoun } from "@/lib/listing";
import { isPublicVendor } from "@/lib/public-listing";
import { Breadcrumbs } from "@/components/listing/ListingParts";
import { getPortfolio } from "@/lib/actions/vendor-portfolio";
import { toGallery } from "@/lib/portfolio";
import { PortfolioGallery } from "@/components/vendor/PortfolioGallery";
import { VendorOffer, type AddOn, type Package } from "@/components/vendor/Offer";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { SiteFooter } from "@/components/ui/SiteFooter";

type Params = Promise<{ city: string; category: string; slug: string }>;

type Row = {
  id: string;
  business_name: string;
  category: string;
  bio: string | null;
  metro_slug: string | null;
  website: string | null;
  slug: string | null;
  service_radius_miles: number | null;
  published: boolean;
  listed_until: string | null;
  metros: { name: string; state: string } | { name: string; state: string }[] | null;
  vendor_packages: Package[];
  vendor_addons: AddOn[];
  testimonials: { id: string; author_name: string; rating: number | null; body: string; verified: boolean; source: string | null }[];
};

// One lookup per request, shared by the metadata and the page. Public vendors only (published,
// and on a monthly/yearly plan once PUBLIC_PAGES_REQUIRE_PLAN is on; see lib/public-listing).
const getVendor = cache(async (slug: string) => {
  const { data } = await supabaseAdmin
    .from("vendors")
    .select(
      "id, business_name, category, bio, metro_slug, website, slug, service_radius_miles, published, listed_until, metros(name, state), vendor_packages(id, name, description, price, inclusions), vendor_addons(id, name, description, price), testimonials(id, author_name, rating, body, verified, source)"
    )
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as Row;
  if (!isPublicVendor(row)) return null;
  const metro = Array.isArray(row.metros) ? row.metros[0] : row.metros;
  return { ...row, city: metro ?? null };
});

// The vendor's photos and videos, shared by the metadata (cover as the share image) and the page.
const getGallery = cache(async (v: { id: string; business_name: string; category: string }, place: string) =>
  // Absolute URLs: they go into Open Graph tags and JSON-LD.
  toGallery(await getPortfolio(supabaseAdmin, v.id), { business: v.business_name, kind: categoryLabel(v.category), place }, siteUrl())
);

function copy(v: NonNullable<Awaited<ReturnType<typeof getVendor>>>) {
  const kind = categoryLabel(v.category);
  const place = v.city ? `${v.city.name}, ${v.city.state}` : "the Carolinas";
  return {
    kind,
    place,
    title: `${v.business_name} | ${kind} in ${place}`,
    description: metaDescription(
      v.bio,
      `${v.business_name} is a wedding ${kind.toLowerCase()} serving ${place}. See packages, pricing and reviews on ${SITE_NAME}.`
    ),
  };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const v = await getVendor(slug);
  if (!v) return { title: "Vendor not found", robots: { index: false } };
  const c = copy(v);
  const path = vendorPath(v);
  const url = path ? `${siteUrl()}${path}` : undefined;
  const cover = (await getGallery(v, c.place)).photos[0];
  const images = cover ? [{ url: cover.full, alt: cover.alt, width: cover.width ?? undefined, height: cover.height ?? undefined }] : undefined;
  return {
    title: c.title,
    description: c.description,
    alternates: url ? { canonical: url } : undefined,
    openGraph: { type: "website", siteName: SITE_NAME, title: c.title, description: c.description, url, images },
    twitter: { card: cover ? "summary_large_image" : "summary", title: c.title, description: c.description, images: cover ? [cover.full] : undefined },
  };
}

export default async function PublicVendorPage({ params }: { params: Params }) {
  const { city, category, slug } = await params;
  const v = await getVendor(slug);
  const path = v && vendorPath(v);
  if (!v || !path) notFound();

  // One address per vendor: a wrong city or category in the URL goes to the right one.
  if (path !== `/wedding-vendors/${city}/${category}/${slug}`) permanentRedirect(path);

  const c = copy(v);
  const url = `${siteUrl()}${path}`;
  const gallery = await getGallery(v, c.place);
  const prices = v.vendor_packages.map((p) => p.price);
  const ld = vendorJsonLd({
    name: v.business_name,
    category: v.category,
    bio: v.bio,
    website: v.website,
    url,
    homeUrl: siteUrl(),
    images: gallery.photos.map((p) => p.full),
    cityUrl: v.metro_slug ? `${siteUrl()}${cityPath(v.metro_slug)}` : undefined,
    listingUrl: v.metro_slug ? `${siteUrl()}${listingPath(v.metro_slug, v.category)}` : undefined,
    city: v.city,
    radiusMiles: v.service_radius_miles,
    packages: v.vendor_packages,
    reviews: v.testimonials.map((t) => ({ author: t.author_name, rating: t.rating, body: t.body, verified: t.verified })),
  });

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-10 px-4 pb-16 sm:px-6">
        <Breadcrumbs
          items={[
            { name: "Home", href: "/" },
            ...(v.metro_slug && v.city
              ? [
                  { name: c.place, href: cityPath(v.metro_slug) },
                  { name: listingNoun(v.category), href: listingPath(v.metro_slug, v.category) },
                ]
              : []),
            { name: v.business_name },
          ]}
        />

        <header>
          <p className="text-xs font-semibold tracking-wide text-cyan-700 uppercase">
            Wedding {c.kind.toLowerCase()} · {c.place}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{v.business_name}</h1>
          {v.bio && <p className="mt-4 text-lg whitespace-pre-line text-gray-700">{v.bio}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href="/signup" className="rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-600">
              Get a free estimate
            </Link>
            {v.website && (
              // The vendor typed this address, so we don't vouch for it to search engines.
              <a href={v.website} target="_blank" rel="nofollow noopener noreferrer" className="text-sm text-gray-600 underline-offset-2 hover:underline">
                Visit their website
              </a>
            )}
          </div>
        </header>

        <PortfolioGallery photos={gallery.photos} videos={gallery.videos} name={v.business_name} />

        <section aria-labelledby="packages">
          <h2 id="packages" className="text-xl font-semibold tracking-tight">
            Packages and pricing
          </h2>
          {prices.length > 0 && (
            <p className="mt-1 text-sm text-gray-600">
              {c.kind} packages from ${Math.min(...prices).toLocaleString("en-US")}.
            </p>
          )}
          <div className="mt-4">
            <VendorOffer packages={v.vendor_packages} addOns={v.vendor_addons} empty="Packages are coming soon. Ask for an estimate." />
          </div>
        </section>

        <section aria-labelledby="area">
          <h2 id="area" className="text-xl font-semibold tracking-tight">
            Where they work
          </h2>
          <p className="mt-2 text-gray-700">
            {v.business_name} serves {c.place}
            {v.service_radius_miles ? ` and couples within about ${v.service_radius_miles} miles` : " and the surrounding area"}.
          </p>
          {v.metro_slug && (
            <p className="mt-2 text-sm">
              <Link href={listingPath(v.metro_slug, v.category)} className="text-cyan-700 hover:underline">
                See more {lowerNoun(listingNoun(v.category))} in {c.place}
              </Link>
            </p>
          )}
        </section>

        {v.testimonials.length > 0 && (
          <section aria-labelledby="reviews">
            <h2 id="reviews" className="text-xl font-semibold tracking-tight">
              Reviews
            </h2>
            <ul className="mt-4 space-y-4">
              {v.testimonials.slice(0, 10).map((t) => (
                <li key={t.id} className="border-l-2 border-gray-200 pl-4">
                  <blockquote className="text-gray-800">&ldquo;{t.body}&rdquo;</blockquote>
                  <p className="mt-1 text-sm text-gray-500">
                    {t.author_name}
                    {t.rating ? ` · ${t.rating} out of 5` : ""}
                    {` · ${reviewBadge(t)}`}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-2xl bg-cyan-50 p-6">
          <h2 className="text-lg font-semibold tracking-tight">Planning a wedding in {c.place}?</h2>
          <p className="mt-1 text-sm text-gray-700">
            Post your wedding once on {SITE_NAME}. Vendors who are free on your date and fit your budget send you estimates.
          </p>
          <Link href="/signup" className="mt-4 inline-flex rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-600">
            Get started
          </Link>
        </section>
      </main>
      <SiteFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(ld) }} />
    </div>
  );
}
