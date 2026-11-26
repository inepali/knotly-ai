// src/lib/actions/registry.ts — the couple's Gift Registry (add-on): store links, funds, wish items.
import { z } from "zod";
import { loadGiftNotes, loadRegistry } from "@/lib/registry-data";
import { methodLink, storeFromUrl } from "@/lib/registry";
import { getProject } from "./wedding";
import { fail, ok, parseInput, type Sb } from "./result";

const LOCKED = "Unlock the Gift Registry add-on first.";
const https = z.string().trim().max(500).regex(/^https:\/\/\S+$/i, "Links must start with https://");
const optText = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);

export const SaveLinkInput = z.object({ id: z.uuid().optional(), store: z.string().trim().max(60).default(""), url: https, note: optText(200) });
export const SaveFundInput = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1, "Give the fund a name.").max(80),
  description: optText(600),
  goal_cents: z.number().int().min(100).max(100_000_000).nullish().transform((v) => v ?? null),
  methods: z
    .array(z.object({ kind: z.enum(["venmo", "paypal", "cashapp", "zelle", "honeyfund", "link"]), value: z.string().trim().max(500) }))
    .min(1, "Add at least one way to send money.")
    .max(6)
    .refine((ms) => ms.every((m) => methodLink(m)), "Check the payment details: handles are letters/numbers, links start with https://"),
});
export const SaveItemInput = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1, "Give the item a name.").max(120),
  url: https.nullish().or(z.literal("")).transform((v) => v || null),
  image_url: https.nullish().or(z.literal("")).transform((v) => v || null),
  price_cents: z.number().int().min(0).max(10_000_000).nullish().transform((v) => v ?? null),
  quantity: z.number().int().min(1).max(20).default(1),
  note: optText(200),
});
export const IdInput = z.object({ id: z.uuid() });
export const IntroInput = z.object({ intro: optText(600) });
export type SaveLinkInput = z.input<typeof SaveLinkInput>;
export type SaveFundInput = z.input<typeof SaveFundInput>;
export type SaveItemInput = z.input<typeof SaveItemInput>;
export type IdInput = z.input<typeof IdInput>;
export type IntroInput = z.input<typeof IntroInput>;

async function ctx(sb: Sb, userId: string) {
  const project = await getProject(sb, userId);
  if (!project) return null;
  const { data: active } = await sb.rpc("has_addon", { p_project: project.id, p_key: "registry" });
  return { projectId: project.id as string, active: !!active };
}
const NO_PROJECT = "Save your wedding details on My Wedding first.";
const limitError = (m: string) => (m.includes("registry_limit") ? `You've reached the limit (${m.match(/up to (\d+)/)?.[1] ?? ""}) for this list.` : m);

export async function loadRegistryEditor(sb: Sb, userId: string) {
  const c = await ctx(sb, userId);
  if (!c) return fail(NO_PROJECT);
  const [registry, notes, { data: site }] = await Promise.all([
    loadRegistry(sb, c.projectId),
    loadGiftNotes(sb, c.projectId),
    sb.from("wedding_sites").select("slug, published_at").eq("project_id", c.projectId).maybeSingle(),
  ]);
  return ok({ ...registry, notes, active: c.active, site: site as { slug: string; published_at: string | null } | null });
}

type Table = "registry_links" | "registry_funds" | "registry_items";
async function upsertRow(sb: Sb, userId: string, table: Table, row: Record<string, unknown> & { id?: string }) {
  const c = await ctx(sb, userId);
  if (!c) return fail(NO_PROJECT);
  if (!c.active) return fail(LOCKED);
  const { id, ...fields } = row;
  if (id) {
    const { data, error } = await sb.from(table).update(fields).eq("id", id).eq("project_id", c.projectId).select("id");
    if (error) return fail(error.message);
    return data?.length ? ok({ id }) : fail("Not found.");
  }
  const { data: last } = await sb.from(table).select("sort").eq("project_id", c.projectId).order("sort", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await sb
    .from(table)
    .insert({ ...fields, project_id: c.projectId, sort: ((last?.sort as number | undefined) ?? -1) + 1 })
    .select("id")
    .single();
  return error ? fail(limitError(error.message)) : ok({ id: (data as { id: string }).id });
}

async function deleteRow(sb: Sb, userId: string, table: Table | "registry_gift_notes", input: unknown) {
  const p = parseInput(IdInput, input);
  if (!p.ok) return p;
  const c = await ctx(sb, userId);
  if (!c) return fail(NO_PROJECT);
  const { error } = await sb.from(table).delete().eq("id", p.data.id).eq("project_id", c.projectId);
  return error ? fail(error.message) : ok({ removed: p.data.id });
}

export async function saveRegistryLink(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(SaveLinkInput, input);
  if (!p.ok) return p;
  return upsertRow(sb, userId, "registry_links", { ...p.data, store: p.data.store || storeFromUrl(p.data.url) || "Registry" });
}
export async function saveRegistryFund(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(SaveFundInput, input);
  if (!p.ok) return p;
  return upsertRow(sb, userId, "registry_funds", p.data);
}
export async function saveRegistryItem(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(SaveItemInput, input);
  if (!p.ok) return p;
  return upsertRow(sb, userId, "registry_items", p.data);
}
export const deleteRegistryLink = (sb: Sb, u: string, i: unknown) => deleteRow(sb, u, "registry_links", i);
export const deleteRegistryFund = (sb: Sb, u: string, i: unknown) => deleteRow(sb, u, "registry_funds", i);
export const deleteRegistryItem = (sb: Sb, u: string, i: unknown) => deleteRow(sb, u, "registry_items", i);
export const deleteGiftNote = (sb: Sb, u: string, i: unknown) => deleteRow(sb, u, "registry_gift_notes", i);

/** Un-claim an item (a guest changed their mind, or it was a mistake). RLS checks it's this wedding's. */
export async function removeClaim(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(IdInput, input);
  if (!p.ok) return p;
  const { data, error } = await sb.from("registry_claims").delete().eq("id", p.data.id).select("id");
  if (error) return fail(error.message);
  return data?.length ? ok({ removed: p.data.id }) : fail("Not found.");
}

export async function saveRegistryIntro(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(IntroInput, input);
  if (!p.ok) return p;
  const c = await ctx(sb, userId);
  if (!c) return fail(NO_PROJECT);
  if (!c.active) return fail(LOCKED);
  const { error } = await sb
    .from("registry_settings")
    .upsert({ project_id: c.projectId, intro: p.data.intro, updated_at: new Date().toISOString() }, { onConflict: "project_id" });
  return error ? fail(error.message) : ok({ saved: true });
}
