// src/lib/registry-data.ts — load a wedding's registry. The public version (service role) leaves out
// who claimed what; the couple's version (their RLS client) includes claims and gift notes.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FundMethod, RegistryFund, RegistryItem, RegistryLink } from "./registry";

export type Claim = { id: string; item_id: string; name: string; note: string | null; created_at: string };
export type GiftNote = { id: string; fund_id: string | null; name: string; note: string | null; created_at: string };

export async function loadRegistry(db: SupabaseClient, projectId: string) {
  const [{ data: settings }, { data: links }, { data: funds }, { data: items }] = await Promise.all([
    db.from("registry_settings").select("intro").eq("project_id", projectId).maybeSingle(),
    db.from("registry_links").select("id, store, url, note, sort").eq("project_id", projectId).order("sort"),
    db.from("registry_funds").select("id, title, description, goal_cents, methods, sort").eq("project_id", projectId).order("sort"),
    db.from("registry_items").select("id, title, url, image_url, price_cents, quantity, note, sort").eq("project_id", projectId).order("sort"),
  ]);
  const ids = (items ?? []).map((i) => i.id as string);
  const { data: claims } = ids.length
    ? await db.from("registry_claims").select("id, item_id, name, note, created_at").in("item_id", ids).order("created_at")
    : { data: [] };
  const count = (id: string) => (claims ?? []).filter((c) => c.item_id === id).length;
  return {
    intro: (settings?.intro as string | null) ?? null,
    links: (links ?? []) as RegistryLink[],
    funds: ((funds ?? []) as (RegistryFund & { methods: FundMethod[] | null })[]).map((f) => ({ ...f, methods: f.methods ?? [] })),
    items: ((items ?? []) as Omit<RegistryItem, "claimed">[]).map((i) => ({ ...i, claimed: count(i.id) })),
    claims: (claims ?? []) as Claim[],
  };
}

/** For the public page: drop guests' names and notes. */
export async function loadPublicRegistry(db: SupabaseClient, projectId: string) {
  const { claims: _private, ...r } = await loadRegistry(db, projectId);
  return r;
}
export type PublicRegistry = Awaited<ReturnType<typeof loadPublicRegistry>>;

export async function loadGiftNotes(db: SupabaseClient, projectId: string) {
  const { data } = await db
    .from("registry_gift_notes")
    .select("id, fund_id, name, note, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []) as GiftNote[];
}
