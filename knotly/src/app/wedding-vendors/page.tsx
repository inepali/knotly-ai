// src/app/wedding-vendors/page.tsx — every city we list vendors in, linking to each city page.
import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, siteUrl } from "@/lib/site";
import { cityPath, placeName } from "@/lib/listing";
import { allCities, listedVendors } from "@/lib/public-listing";
import { Breadcrumbs } from "@/components/listing/ListingParts";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { SiteFooter } from "@/components/ui/SiteFooter";

export const dynamic = "force-dynamic";

const title = "Wedding Vendors in the Carolinas";
const description = `Browse wedding vendors by city on ${SITE_NAME}, then post your wedding once and get free estimates.`;

export const metadata: Metadata = {
  title: `${title} | ${SITE_NAME}`,
  description,
  alternates: { canonical: `${siteUrl()}/wedding-vendors` },
};

export default async function WeddingVendorsIndex() {
  const [cities, rows] = await Promise.all([allCities(), listedVendors(null)]);
  const count = (slug: string) => new Set(rows.filter((r) => r.listing_metro === slug).map((r) => r.vendor_id)).size;

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 px-4 pb-16 sm:px-6">
        <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Wedding vendors" }]} />
        <header>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-4 text-lg text-gray-700">{description}</p>
        </header>
        <ul className="grid gap-3 sm:grid-cols-3">
          {cities.map((c) => (
            <li key={c.slug}>
              <Link href={cityPath(c.slug)} className="block rounded-xl border border-gray-200 p-4 hover:border-cyan-300">
                <span className="font-semibold">{placeName(c)}</span>
                <span className="block text-sm text-gray-500">
                  {count(c.slug) === 1 ? "1 vendor" : `${count(c.slug)} vendors`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
