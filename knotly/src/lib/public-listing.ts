// src/lib/public-listing.ts — who is public, and the reads behind the listing pages and sitemap.
// One place for the "public page" rule, so the vendor page, listings and sitemap always agree.
import "server-only";
import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { City } from "@/lib/listing";

/**
 * Every published vendor gets a free public page and shows in listings (pricing decision,
 * Nov 2026: vendors pay per opened estimate, not for visibility). The old plan gate
 * (vendors.listed_until, list_public_vendors' p_require_plan) stays in the database, unused,
 * in case subscriptions come back.
 */
export function isPublicVendor(v: { published: boolean | null }) {
  return !!v.published;
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
  cover_thumb_path?: string | null; // from the portfolio migration
};

/** Public vendors who serve a city (based there or within their service radius). Null = every city. */
export const listedVendors = cache(async (metro: string | null): Promise<ListedVendor[]> => {
  const { data, error } = await supabaseAdmin.rpc("list_public_vendors", { p_metro: metro, p_require_plan: false });
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
