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
import { jsonLdString, metaDescription, vendorJsonLd, vendorPath } from "@/lib/vendor-seo";
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
  metros: { name: string; state: string } | { name: string; state: string }[] | null;
  vendor_packages: Package[];
  vendor_addons: AddOn[];
  testimonials: { id: string; author_name: string; rating: number | null; body: string; verified: boolean }[];
};

// One lookup per request, shared by the metadata and the page. Published vendors only.
const getVendor = cache(async (slug: string) => {
  const { data } = await supabaseAdmin
    .from("vendors")
    .select(
      "id, business_name, category, bio, metro_slug, website, slug, service_radius_miles, metros(name, state), vendor_packages(id, name, description, price, inclusions), vendor_addons(id, name, description, price), testimonials(id, author_name, rating, body, verified)"
    )
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as Row;
  const metro = Array.isArray(row.metros) ? row.metros[0] : row.metros;
  return { ...row, city: metro ?? null };
});

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
  return {
    title: c.title,
    description: c.description,
    alternates: url ? { canonical: url } : undefined,
    openGraph: { type: "website", siteName: SITE_NAME, title: c.title, description: c.description, url },
    twitter: { card: "summary", title: c.title, description: c.description },
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
  const prices = v.vendor_packages.map((p) => p.price);
  const ld = vendorJsonLd({
    name: v.business_name,
    category: v.category,
    bio: v.bio,
    website: v.website,
    url,
    homeUrl: siteUrl(),
    city: v.city,
    radiusMiles: v.service_radius_miles,
    packages: v.vendor_packages,
    reviews: v.testimonials.map((t) => ({ author: t.author_name, rating: t.rating, body: t.body, verified: t.verified })),
  });

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-10 px-4 pb-16 sm:px-6">
        <nav aria-label="Breadcrumb" className="text-sm text-gray-500">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-gray-900 hover:underline">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              {c.kind} in {c.place}
            </li>
          </ol>
        </nav>

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
                    {t.verified ? " · verified by the couple" : ""}
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
