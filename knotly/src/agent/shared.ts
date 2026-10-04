// src/agent/shared.ts
import { z } from "zod";
import { CATEGORY_SLUGS } from "@/lib/categories";
import type { SupabaseClient } from "@supabase/supabase-js";

// The vendor category list lives in src/lib/categories.ts (mirrors the vendor_categories table).
export const CATEGORIES = CATEGORY_SLUGS;
export const Category = z.enum(CATEGORY_SLUGS);

export type ToolCtx = {
  sb: SupabaseClient;
  userId: string;
  isGuest: boolean; // anonymous session that hasn't verified an email yet
};

// "Charlotte", "charlotte, nc" or "charlotte-nc" -> metro row (or null)
export async function resolveMetro(sb: SupabaseClient, input: string) {
  const q = input.split(",")[0].trim();
  const bySlug = await sb
    .from("metros")
    .select("*")
    .eq("slug", q.toLowerCase())
    .maybeSingle();
  if (bySlug.data) return bySlug.data;
  const byName = await sb
    .from("metros")
    .select("*")
    .ilike("name", q)
    .limit(1)
    .maybeSingle();
  return byName.data as {
    slug: string;
    name: string;
    lat: number;
    lng: number;
  } | null;
}
