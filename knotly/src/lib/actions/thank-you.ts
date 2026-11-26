// src/lib/actions/thank-you.ts — Thank-You Tracker (add-on): gifts, thank-you status, registry import.
import { z } from "zod";
import { loadGiftNotes, loadRegistry } from "@/lib/registry-data";
import { matchHousehold, type Gift, type TyHousehold } from "@/lib/thank-you";
import { getProject } from "./wedding";
import { fail, ok, parseInput, type Sb } from "./result";

const LOCKED = "Unlock the Thank-You Tracker first.";
const NO_PROJECT = "Save your wedding details on My Wedding first.";
const day = z.iso.date().nullish().or(z.literal("")).transform((v) => v || null);

export const SaveGiftInput = z
  .object({
    id: z.uuid().optional(),
    household_id: z.uuid().nullish().transform((v) => v ?? null),
    giver: z.string().trim().max(80).nullish().transform((v) => v || null),
    description: z.string().trim().min(1, "What was the gift?").max(200),
    amount_cents: z.number().int().min(0).max(100_000_000).nullish().transform((v) => v ?? null),
    received_on: day,
    thanked_on: day,
    notes: z.string().trim().max(500).nullish().transform((v) => v || null),
  })
  .refine((g) => g.household_id || g.giver, "Choose who it's from.");
export type SaveGiftInput = z.input<typeof SaveGiftInput>;
export const ThankedInput = z.object({ ids: z.array(z.uuid()).min(1).max(500), thanked: z.boolean() });
export type ThankedInput = z.input<typeof ThankedInput>;
export const GiftIdInput = z.object({ id: z.uuid() });
export type GiftIdInput = z.input<typeof GiftIdInput>;

async function ctx(sb: Sb, userId: string) {
  const project = await getProject(sb, userId);
  if (!project) return null;
  const [{ data: active }, { data: registry }] = await Promise.all([
    sb.rpc("has_addon", { p_project: project.id, p_key: "thank_you" }),
    sb.rpc("has_addon", { p_project: project.id, p_key: "registry" }),
  ]);
  return { projectId: project.id as string, active: !!active, registry: !!registry };
}

async function loadHouseholds(sb: Sb, projectId: string): Promise<TyHousehold[]> {
  const { data } = await sb.from("guest_households").select("id, label, address, guests(first_name, last_name)").eq("project_id", projectId).order("label");
  return ((data ?? []) as TyHousehold[]).map((h) => ({ ...h, address: h.address ?? {} }));
}

export async function loadThankYou(sb: Sb, userId: string) {
  const c = await ctx(sb, userId);
  if (!c) return fail(NO_PROJECT);
  const [{ data: gifts }, households] = await Promise.all([
    sb
      .from("thank_you_gifts")
      .select("id, household_id, giver, description, amount_cents, received_on, thanked_on, notes, source")
      .eq("project_id", c.projectId)
      .order("created_at", { ascending: false }),
    loadHouseholds(sb, c.projectId),
  ]);
  return ok({ active: c.active, hasRegistry: c.registry, gifts: (gifts ?? []) as Gift[], households });
}

export async function saveGift(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(SaveGiftInput, input);
  if (!p.ok) return p;
  const c = await ctx(sb, userId);
  if (!c) return fail(NO_PROJECT);
  if (!c.active) return fail(LOCKED);
  const { id, ...row } = p.data;
  const r = id
    ? await sb.from("thank_you_gifts").update(row).eq("id", id).eq("project_id", c.projectId).select("id").maybeSingle()
    : await sb.from("thank_you_gifts").insert({ ...row, project_id: c.projectId }).select("id").single();
  if (r.error) return fail(r.error.message.includes("gift_limit") ? "You can track up to 2,000 gifts." : r.error.message);
  return r.data ? ok({ id: (r.data as { id: string }).id }) : fail("Gift not found.");
}

/** Mark thank-you notes as sent (today) or not sent. */
export async function markThanked(sb: Sb, userId: string, input: unknown, today = new Date().toISOString().slice(0, 10)) {
  const p = parseInput(ThankedInput, input);
  if (!p.ok) return p;
  const c = await ctx(sb, userId);
  if (!c) return fail(NO_PROJECT);
  if (!c.active) return fail(LOCKED);
  const { data, error } = await sb
    .from("thank_you_gifts")
    .update({ thanked_on: p.data.thanked ? today : null })
    .in("id", p.data.ids)
    .eq("project_id", c.projectId)
    .select("id");
  return error ? fail(error.message) : ok({ updated: data?.length ?? 0 });
}

export async function deleteGift(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(GiftIdInput, input);
  if (!p.ok) return p;
  const c = await ctx(sb, userId);
  if (!c) return fail(NO_PROJECT);
  const { error } = await sb.from("thank_you_gifts").delete().eq("id", p.data.id).eq("project_id", c.projectId);
  return error ? fail(error.message) : ok({ removed: p.data.id });
}

/**
 * Pull in registry claims and "I sent a gift" notes that aren't in the log yet, matching each name
 * to a household when it's unambiguous. Safe to run again: each source row is imported once.
 */
export async function importFromRegistry(sb: Sb, userId: string) {
  const c = await ctx(sb, userId);
  if (!c) return fail(NO_PROJECT);
  if (!c.active) return fail(LOCKED);
  if (!c.registry) return fail("You don't have the Gift Registry add-on.");
  const [registry, notes, households, { data: existing }] = await Promise.all([
    loadRegistry(sb, c.projectId),
    loadGiftNotes(sb, c.projectId),
    loadHouseholds(sb, c.projectId),
    sb.from("thank_you_gifts").select("source, source_id").eq("project_id", c.projectId).not("source_id", "is", null),
  ]);
  const have = new Set((existing ?? []).map((e) => `${e.source}:${e.source_id}`));
  const itemTitle = new Map(registry.items.map((i) => [i.id, { title: i.title, price: i.price_cents }]));
  const fundTitle = new Map(registry.funds.map((f) => [f.id, f.title]));
  const rows = [
    ...registry.claims
      .filter((cl) => !have.has(`registry_claim:${cl.id}`))
      .map((cl) => ({
        source: "registry_claim" as const,
        source_id: cl.id,
        giver: cl.name,
        description: itemTitle.get(cl.item_id)?.title ?? "Registry item",
        amount_cents: itemTitle.get(cl.item_id)?.price ?? null,
        notes: cl.note,
      })),
    ...notes
      .filter((n) => !have.has(`gift_note:${n.id}`))
      .map((n) => ({
        source: "gift_note" as const,
        source_id: n.id,
        giver: n.name,
        description: n.fund_id ? (fundTitle.get(n.fund_id) ?? "Cash gift") : "Gift",
        amount_cents: null,
        notes: n.note,
      })),
  ].map((r) => ({ ...r, project_id: c.projectId, household_id: matchHousehold(r.giver, households) }));
  if (!rows.length) return ok({ added: 0, matched: 0 });
  const { error } = await sb.from("thank_you_gifts").insert(rows);
  if (error) return fail(error.message.includes("gift_limit") ? "You can track up to 2,000 gifts." : error.message);
  return ok({ added: rows.length, matched: rows.filter((r) => r.household_id).length });
}
