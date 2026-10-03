// src/components/vendor/BusinessPane.tsx — the vendor's permanent "My Business" tab:
// their listing as couples will see it, loaded from the database (RLS: own row, even unpublished).
"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { VendorOffer, type AddOn, type Package } from "./Offer";

type Listing = {
  business_name: string;
  category: string;
  bio: string | null;
  metro_slug: string | null;
  website: string | null;
  published: boolean;
  vendor_packages: Package[];
  vendor_addons: AddOn[];
  testimonials: { id: string; author_name: string; rating: number | null; body: string; verified: boolean }[];
};

const city = (slug: string | null) =>
  slug ? slug.replace(/-([a-z]{2})$/, (_, s) => `, ${s.toUpperCase()}`).replace(/^\w/, (c) => c.toUpperCase()) : null;

export default function BusinessPane({ refreshKey = 0 }: { refreshKey?: number }) {
  const [listing, setListing] = useState<Listing | null | undefined>(undefined); // undefined = loading

  useEffect(() => {
    let off = false;
    const sb = supabaseBrowser();
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: row } = await sb
        .from("vendors")
        .select(
          "business_name, category, bio, metro_slug, website, published, vendor_packages(id, name, description, price, inclusions), vendor_addons(id, name, description, price), testimonials(id, author_name, rating, body, verified)"
        )
        .eq("id", data.user.id)
        .maybeSingle();
      if (!off) setListing((row as Listing | null) ?? null);
    });
    return () => {
      off = true;
    };
  }, [refreshKey]); // reload when the assistant saves something

  if (listing === undefined) return <p className="text-sm text-gray-500">Loading your listing…</p>;
  if (listing === null)
    return (
      <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700">
        No listing yet. Tell the assistant your business name, what you do and your city to get started.
      </p>
    );

  const missing = [
    !listing.bio && "a short bio",
    !listing.metro_slug && "your city",
    !listing.vendor_packages.length && "at least one package",
  ].filter(Boolean);

  return (
    <div className="space-y-6 text-sm">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            {listing.category.replace("_", " & ")}
            {city(listing.metro_slug) && ` · ${city(listing.metro_slug)}`}
          </p>
          <h3 className="text-xl font-semibold">{listing.business_name}</h3>
          {listing.website && (
            <a href={listing.website} target="_blank" rel="noreferrer" className="text-xs text-gray-500 underline-offset-2 hover:underline">
              {listing.website}
            </a>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${
            listing.published
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-gray-100 text-gray-600 dark:bg-gray-900 dark:text-gray-400"
          }`}
        >
          {listing.published ? "Live — couples can find you" : "Draft — not visible to couples"}
        </span>
      </header>

      {listing.bio && <p className="text-gray-700 dark:text-gray-300">{listing.bio}</p>}

      {missing.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Still needed: {missing.join(", ")}. Tell the assistant and it will add them.
        </p>
      )}

      <section className="space-y-2">
        <p className="text-xs text-gray-500">What couples see:</p>
        <VendorOffer
          packages={listing.vendor_packages}
          addOns={listing.vendor_addons}
          empty="No packages yet. Paste your price list into the chat and the assistant will create them."
        />
      </section>

      <section>
        <h4 className="mb-2 text-sm font-medium text-gray-500">Reviews ({listing.testimonials.length})</h4>
        {listing.testimonials.length === 0 ? (
          <p className="text-gray-500">None yet. Paste reviews from past clients into the chat to add them.</p>
        ) : (
          <ul className="space-y-2">
            {listing.testimonials.slice(0, 5).map((t) => (
              <li key={t.id} className="border-l-2 border-gray-200 pl-3 dark:border-gray-800">
                <p className="line-clamp-3">“{t.body}”</p>
                <p className="mt-1 text-xs text-gray-500">
                  {t.author_name}
                  {t.rating ? ` · ${t.rating}★` : ""}
                  {t.verified ? "" : " · unverified"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
