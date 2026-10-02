// src/agent/shared.ts
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export const CATEGORIES = [
  "photographer",
  "videographer",
  "dj",
  "band",
  "florist",
  "venue",
  "caterer",
  "planner",
  "hair_makeup",
  "officiant",
  "cake",
  "rentals",
] as const;
export const Category = z.enum(CATEGORIES);

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
