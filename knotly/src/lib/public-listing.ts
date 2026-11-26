// src/lib/public-listing.ts — who is public, and the reads behind the listing pages and sitemap.
// One place for the "public page" rule, so the vendor page, listings and sitemap always agree.
import "server-only";
import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { City } from "@/lib/listing";

/**
 * Public pages are a monthly/yearly plan feature (vendors.listed_until, set by billing).
 * Off until billing ships: until then every published vendor is public, as before.
 * Set PUBLIC_PAGES_REQUIRE_PLAN=1 to enforce it.
 */
export const REQUIRE_PLAN = process.env.PUBLIC_PAGES_REQUIRE_PLAN === "1";

/** True when this vendor gets a public page and shows in listings. */
export function isPublicVendor(v: { published: boolean | null; listed_until?: string | null }, now = new Date()) {
  if (!v.published) return false;
  if (!REQUIRE_PLAN) return true;
  return !!v.listed_until && new Date(v.listed_until) > now;
}

export type ListedVendor = {
  listing_metro: string;
  vendor_id: string;
  slug: string;
  business_name: string;
  category: string;
  bio: string | null;
  home_metro: string;
  service_radius_miles: number | null;
  min_price: number | null;
  updated_at: string | null;
};

/** Public vendors who serve a city (based there or within their service radius). Null = every city. */
export const listedVendors = cache(async (metro: string | null): Promise<ListedVendor[]> => {
  const { data, error } = await supabaseAdmin.rpc("list_public_vendors", { p_metro: metro, p_require_plan: REQUIRE_PLAN });
  if (error) {
    console.error("[listing] list_public_vendors", error.message);
    return [];
  }
  return (data ?? []) as ListedVendor[];
});

export const allCities = cache(async (): Promise<City[]> => {
  const { data } = await supabaseAdmin.from("metros").select("slug, name, state, lat, lng").order("name");
  return (data ?? []) as City[];
});

export const cityBySlug = cache(async (slug: string) => (await allCities()).find((c) => c.slug === slug) ?? null);
