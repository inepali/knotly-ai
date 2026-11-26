// src/lib/vendor-seo.ts — the public vendor page's address, search snippet and structured data.
// Pure functions, so they're easy to test.
import { CATEGORY_SLUGS, categoryLabel } from "@/lib/categories";

/** photo_editor -> photo-editor (hyphens read better in a URL). */
export const categoryParam = (slug: string) => slug.replace(/_/g, "-");

/** photo-editor -> photo_editor, or null if it isn't a real category. */
export function categoryFromParam(param: string) {
  const slug = param.replace(/-/g, "_");
  return (CATEGORY_SLUGS as readonly string[]).includes(slug) ? slug : null;
}

/** /wedding-vendors/charlotte-nc/photographer/golden-hour-photography-3f9a1c, or null if the vendor has no slug or city yet. */
export function vendorPath(v: { slug?: string | null; metro_slug?: string | null; category: string }) {
  if (!v.slug || !v.metro_slug) return null;
  return `/wedding-vendors/${v.metro_slug}/${categoryParam(v.category)}/${v.slug}`;
}

/** One-line text for a search result: whitespace tidied, cut at a word boundary. */
export function metaDescription(text: string | null | undefined, fallback: string, max = 155) {
  const clean = (text ?? "").replace(/\s+/g, " ").trim() || fallback;
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).replace(/[\s,.;:–-]+$/, "")}…`;
}

export type SeoVendor = {
  name: string;
  category: string;
  bio: string | null;
  website: string | null;
  url: string; // absolute URL of the public page
  homeUrl: string;
  city: { name: string; state: string } | null;
  radiusMiles: number | null;
  packages: { name: string; description: string | null; price: number }[];
  reviews: { author: string; rating: number | null; body: string; verified: boolean }[];
};

/**
 * schema.org markup for search engines. Ratings and reviews are only included when the client
 * verified them: reviews a business writes about itself must not be marked up.
 */
export function vendorJsonLd(v: SeoVendor) {
  const place = v.city ? `${v.city.name}, ${v.city.state}` : null;
  const verified = v.reviews.filter((r) => r.verified && r.rating);
  const prices = v.packages.map((p) => p.price);

  const business: Record<string, unknown> = {
    "@type": "LocalBusiness",
    "@id": `${v.url}#business`,
    name: v.name,
    url: v.url,
    description: metaDescription(v.bio, `${v.name} is a ${categoryLabel(v.category).toLowerCase()} for weddings.`, 500),
    ...(place && { areaServed: { "@type": "City", name: place } }),
    ...(v.city && {
      address: { "@type": "PostalAddress", addressLocality: v.city.name, addressRegion: v.city.state, addressCountry: "US" },
    }),
    ...(v.website && { sameAs: [v.website] }),
    ...(prices.length && {
      priceRange: Math.min(...prices) === Math.max(...prices) ? `$${Math.min(...prices)}` : `$${Math.min(...prices)}-$${Math.max(...prices)}`,
    }),
    ...(v.packages.length && {
      makesOffer: v.packages.map((p) => ({
        "@type": "Offer",
        name: p.name,
        ...(p.description && { description: p.description }),
        price: p.price,
        priceCurrency: "USD",
      })),
    }),
    ...(verified.length && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: Math.round((verified.reduce((s, r) => s + (r.rating ?? 0), 0) / verified.length) * 10) / 10,
        reviewCount: verified.length,
        bestRating: 5,
        worstRating: 1,
      },
      review: verified.map((r) => ({
        "@type": "Review",
        author: { "@type": "Person", name: r.author },
        reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
        reviewBody: r.body,
      })),
    }),
  };

  const crumbs = [
    { name: "Home", url: v.homeUrl },
    { name: `${categoryLabel(v.category)}${place ? ` in ${place}` : ""}`, url: v.url },
    { name: v.name, url: v.url },
  ];
  const breadcrumbs = {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.url })),
  };

  return { "@context": "https://schema.org", "@graph": [business, breadcrumbs] };
}

/** JSON for a <script type="application/ld+json">: "<" is escaped so text can't close the tag early. */
export const jsonLdString = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
