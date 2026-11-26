"use server";
// Guests on the wedding website: claim a wish item, or tell the couple they sent a gift.
// Runs as the service role after checking the site and the add-on; names stay private to the couple.
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { guestQuota, openSiteFor } from "@/lib/public-site-access";

type R = { ok: boolean; error?: string };
const clean = (s: string | null | undefined, max: number) => (s ?? "").trim().slice(0, max);

export async function claimItemAction(slug: string, itemId: string, name: string, note: string, website: string): Promise<R> {
  if (website) return { ok: false, error: "Something went wrong." }; // honeypot
  const site = await openSiteFor(slug, "registry");
  if (!site) return { ok: false, error: "The registry isn't available." };
  const who = clean(name, 60);
  if (!who) return { ok: false, error: "Add your name so the couple knows who to thank." };
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return { ok: false, error: "That item isn't on the registry." };
  if (!(await guestQuota("registry-claim", 20))) return { ok: false, error: "Too many tries today." };
  const { data, error } = await supabaseAdmin.rpc("claim_registry_item", {
    p_project: site.projectId,
    p_item: itemId,
    p_name: who,
    p_note: clean(note, 300),
  });
  if (error) return { ok: false, error: "Please try again." };
  if (data === "taken") return { ok: false, error: "Someone already got this one. Thank you anyway!" };
  if (data !== "ok") return { ok: false, error: "That item isn't on the registry." };
  revalidatePath(`/w/${site.slug}`);
  return { ok: true };
}

export async function giftNoteAction(slug: string, fundId: string | null, name: string, note: string, website: string): Promise<R> {
  if (website) return { ok: false, error: "Something went wrong." };
  const site = await openSiteFor(slug, "registry");
  if (!site) return { ok: false, error: "The registry isn't available." };
  const who = clean(name, 60);
  if (!who) return { ok: false, error: "Add your name so the couple knows who to thank." };
  if (!(await guestQuota("registry-note", 20))) return { ok: false, error: "Too many tries today." };
  let fund: string | null = null;
  if (fundId) {
    const { data } = await supabaseAdmin.from("registry_funds").select("id").eq("id", fundId).eq("project_id", site.projectId).maybeSingle();
    fund = (data?.id as string | undefined) ?? null;
  }
  const { error } = await supabaseAdmin
    .from("registry_gift_notes")
    .insert({ project_id: site.projectId, fund_id: fund, name: who, note: clean(note, 500) || null });
  return error ? { ok: false, error: "Please try again." } : { ok: true };
}
