// src/components/listing/ListingParts.tsx — pieces shared by the public listing pages.
import Link from "next/link";
import { categoryLabel } from "@/lib/categories";
import { metaDescription, vendorPath } from "@/lib/vendor-seo";
import { usd } from "@/lib/listing";
import { portfolioUrl } from "@/lib/portfolio";
import type { ListedVendor } from "@/lib/public-listing";

export function Breadcrumbs({ items }: { items: { name: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-gray-500">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((it, i) => (
          <li key={it.name} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden="true">/</span>}
            {it.href ? (
              <Link href={it.href} className="hover:text-gray-900 hover:underline">
                {it.name}
              </Link>
            ) : (
              <span aria-current="page">{it.name}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Where "Get free estimates" goes: sign up as a couple with the city and category filled in. */
export const estimatesHref = (metro: string, category?: string) =>
  `/signup?${new URLSearchParams({ role: "couple", metro, ...(category && { need: category }) })}`;

export function EstimatesButton({ metro, category, label = "Get free estimates" }: { metro: string; category?: string; label?: string }) {
  return (
    <Link
      href={estimatesHref(metro, category)}
      className="inline-flex rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-600"
    >
      {label} →
    </Link>
  );
}

export function VendorCard({ v, cityName, homeCityName }: { v: ListedVendor; cityName: string; homeCityName?: string }) {
  const href = vendorPath({ slug: v.slug, metro_slug: v.home_metro, category: v.category });
  if (!href) return null;
  return (
    <li>
      <Link
        href={href}
        className="flex h-full gap-4 rounded-2xl border border-gray-200 p-4 transition hover:border-cyan-300 hover:shadow-sm"
      >
        {v.cover_thumb_path ? (
          // eslint-disable-next-line @next/next/no-img-element -- public CDN thumbnail, already 600px
          <img
            src={portfolioUrl(v.cover_thumb_path)}
            alt={`${v.business_name}, ${categoryLabel(v.category).toLowerCase()}`}
            loading="lazy"
            decoding="async"
            className="h-20 w-20 flex-none rounded-xl bg-gray-100 object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-20 w-20 flex-none items-center justify-center rounded-xl bg-cyan-50 text-xl font-semibold text-cyan-700"
          >
            {v.business_name.trim().charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900">{v.business_name}</h3>
          <p className="text-sm text-gray-600">
            {v.min_price ? `From ${usd(v.min_price)}` : categoryLabel(v.category)}
            {" · "}
            {homeCityName && v.home_metro !== v.listing_metro ? `Based in ${homeCityName}, serves ${cityName}` : cityName}
          </p>
          {v.bio && <p className="mt-1 line-clamp-2 text-sm text-gray-700">{metaDescription(v.bio, "", 140)}</p>}
        </div>
      </Link>
    </li>
  );
}

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <dl className="mt-4 space-y-5">
      {items.map((f) => (
        <div key={f.q}>
          <dt className="font-medium text-gray-900">{f.q}</dt>
          <dd className="mt-1 text-gray-700">{f.a}</dd>
        </div>
      ))}
    </dl>
  );
}
