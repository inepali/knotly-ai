// src/lib/actions/guests.ts — the free Guest List: households, guests, events, CSV import, guest count.
import { z } from "zod";
import { defaultLabel, GUEST_LIMIT, type Household, type WeddingEvent } from "@/lib/guests";
import { getProject } from "./wedding";
import { fail, ok, parseInput, type Sb } from "./result";

const trimmed = (max: number) => z.string().trim().max(max);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

const GuestInput = z.object({
  id: z.uuid().optional(),
  first_name: trimmed(60).min(1, "Each guest needs a first name."),
  last_name: trimmed(60).default(""),
  is_child: z.boolean().default(false),
  email: optText(254).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "That email doesn't look right."),
  phone: optText(30),
});

export const HouseholdInput = z.object({
  id: z.uuid().optional(),
  label: trimmed(120).default(""),
  side: z.enum(["a", "b", "both"]).default("both"),
  tags: z.array(trimmed(30).min(1)).max(10).default([]),
  plus_ones: z.number().int().min(0).max(5).default(0),
  address: z
    .object({ street: trimmed(120).optional(), city: trimmed(60).optional(), state: trimmed(30).optional(), zip: trimmed(12).optional() })
    .default({}),
  notes: optText(500),
  guests: z.array(GuestInput).min(1, "Add at least one guest.").max(20),
  event_ids: z.array(z.uuid()).max(20).default([]),
});
export type HouseholdInput = z.input<typeof HouseholdInput>;

export const ImportHouseholdsInput = z.object({ households: z.array(HouseholdInput).min(1).max(GUEST_LIMIT) });
export type ImportHouseholdsInput = z.input<typeof ImportHouseholdsInput>;

export const DeleteHouseholdInput = z.object({ id: z.uuid() });
export type DeleteHouseholdInput = z.input<typeof DeleteHouseholdInput>;

export const SaveEventInput = z.object({
  id: z.uuid().optional(),
  name: trimmed(80).min(1, "Give the event a name."),
  starts_at: z.iso.datetime({ offset: true }).nullish().or(z.literal("")).transform((v) => v || null),
  venue: optText(120),
  address: optText(200),
  notes: optText(500),
  sort: z.number().int().min(0).max(100).default(0),
});
export type SaveEventInput = z.input<typeof SaveEventInput>;

const projectOr = async (sb: Sb, userId: string) => {
  const p = await getProject(sb, userId);
  return p ? { id: p.id as string, partner_names: (p.partner_names as string | null) ?? null, guest_count: p.guest_count as number | null } : null;
};
const NO_PROJECT = "Save your wedding details on My Wedding first.";

/** Everything the Guest List page shows. */
export async function loadGuestList(sb: Sb, userId: string) {
  const project = await projectOr(sb, userId);
  if (!project) return ok({ project: null, households: [] as Household[], events: [] as WeddingEvent[] });
  const [{ data: hh }, { data: events }] = await Promise.all([
    sb
      .from("guest_households")
      .select("id, label, side, tags, plus_ones, address, notes, guests(id, first_name, last_name, is_child, email, phone, sort), guest_event_invites(event_id)")
      .eq("project_id", project.id)
      .order("created_at"),
    sb.from("wedding_events").select("id, name, starts_at, venue, sort").eq("project_id", project.id).order("sort").order("created_at"),
  ]);
  type Row = Omit<Household, "guests" | "event_ids"> & {
    guests: (Household["guests"][number] & { sort: number })[];
    guest_event_invites: { event_id: string }[];
  };
  const households: Household[] = ((hh ?? []) as Row[]).map(({ guest_event_invites, guests, ...h }) => ({
    ...h,
    address: h.address ?? {},
    tags: h.tags ?? [],
    guests: [...guests].sort((a, b) => a.sort - b.sort).map(({ sort: _s, ...g }) => g),
    event_ids: guest_event_invites.map((i) => i.event_id),
  }));
  return ok({ project, households, events: (events ?? []) as WeddingEvent[] });
}

const guestLimitError = (msg?: string) => (msg?.includes("guest_limit") ? `A guest list can have up to ${GUEST_LIMIT.toLocaleString("en-US")} guests.` : msg);

async function writeHousehold(sb: Sb, projectId: string, h: z.output<typeof HouseholdInput>) {
  const row = {
    project_id: projectId,
    label: h.label || defaultLabel(h.guests),
    side: h.side,
    tags: [...new Set(h.tags)],
    plus_ones: h.plus_ones,
    address: Object.fromEntries(Object.entries(h.address).filter(([, v]) => v)),
    notes: h.notes,
  };
  const saved = h.id
    ? await sb.from("guest_households").update(row).eq("id", h.id).eq("project_id", projectId).select("id").maybeSingle()
    : await sb.from("guest_households").insert(row).select("id").single();
  if (saved.error) return fail(saved.error.message);
  if (!saved.data) return fail("That household isn't on your list.");
  const id = (saved.data as { id: string }).id;

  // Guests keep their ids across edits (RSVP answers hang off them): update kept ones,
  // insert new ones, delete the ones removed from the form.
  const keep = h.guests.filter((g) => g.id).map((g) => g.id!);
  if (h.id) {
    const del = sb.from("guests").delete().eq("household_id", id);
    const r = keep.length ? await del.not("id", "in", `(${keep.join(",")})`) : await del;
    if (r.error) return fail(r.error.message);
  }
  const rows = h.guests.map((g, i) => ({
    id: h.id ? g.id : undefined,
    row: { first_name: g.first_name, last_name: g.last_name, is_child: g.is_child, email: g.email, phone: g.phone, sort: i },
  }));
  for (const { id: gid, row } of rows.filter((r) => r.id)) {
    const r = await sb.from("guests").update(row).eq("id", gid!).eq("household_id", id);
    if (r.error) return fail(r.error.message);
  }
  const fresh = rows.filter((r) => !r.id).map((r) => ({ ...r.row, household_id: id }));
  if (fresh.length) {
    const r = await sb.from("guests").insert(fresh);
    if (r.error) return fail(guestLimitError(r.error.message) ?? "Couldn't save guests.");
  }

  // Invites: replace (no answers hang off them).
  if (h.id) await sb.from("guest_event_invites").delete().eq("household_id", id);
  if (h.event_ids.length) {
    const inv = await sb.from("guest_event_invites").insert(h.event_ids.map((event_id) => ({ household_id: id, event_id })));
    if (inv.error) return fail(inv.error.message);
  }
  return ok({ id });
}

export async function saveHousehold(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(HouseholdInput, input);
  if (!p.ok) return p;
  const project = await projectOr(sb, userId);
  if (!project) return fail(NO_PROJECT);
  return writeHousehold(sb, project.id, p.data);
}

export async function deleteHousehold(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(DeleteHouseholdInput, input);
  if (!p.ok) return p;
  const project = await projectOr(sb, userId);
  if (!project) return fail(NO_PROJECT);
  const { data, error } = await sb.from("guest_households").delete().eq("id", p.data.id).eq("project_id", project.id).select("id");
  if (error) return fail(error.message);
  return data?.length ? ok({ removed: p.data.id }) : fail("That household isn't on your list.");
}

/** Add households from a CSV preview (new households only; existing ones are left alone). */
export async function importHouseholds(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(ImportHouseholdsInput, input);
  if (!p.ok) return p;
  const project = await projectOr(sb, userId);
  if (!project) return fail(NO_PROJECT);
  let added = 0;
  for (const h of p.data.households) {
    const r = await writeHousehold(sb, project.id, { ...h, id: undefined, event_ids: [] });
    if (!r.ok) return fail(added ? `Imported ${added} households, then stopped: ${r.error}` : r.error);
    added++;
  }
  return ok({ added });
}

/** "Use this as my guest count": copies the list's total (guests + plus-ones) to My Wedding. */
export async function setGuestCountFromList(sb: Sb, userId: string) {
  const list = await loadGuestList(sb, userId);
  if (!list.ok || !list.data.project) return fail(NO_PROJECT);
  const count = list.data.households.reduce((s, h) => s + h.guests.length + h.plus_ones, 0);
  if (!count) return fail("Add guests first.");
  const { error } = await sb.from("couple_projects").update({ guest_count: count }).eq("id", list.data.project.id);
  return error ? fail(error.message) : ok({ guest_count: count });
}

export async function saveEvent(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(SaveEventInput, input);
  if (!p.ok) return p;
  const project = await projectOr(sb, userId);
  if (!project) return fail(NO_PROJECT);
  const { id, ...row } = p.data;
  const r = id
    ? await sb.from("wedding_events").update(row).eq("id", id).eq("project_id", project.id).select("id").maybeSingle()
    : await sb.from("wedding_events").insert({ ...row, project_id: project.id }).select("id").single();
  if (r.error) return fail(r.error.message);
  return r.data ? ok({ id: (r.data as { id: string }).id }) : fail("That event isn't on your list.");
}

export async function deleteEvent(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(DeleteHouseholdInput, input);
  if (!p.ok) return p;
  const project = await projectOr(sb, userId);
  if (!project) return fail(NO_PROJECT);
  const { error } = await sb.from("wedding_events").delete().eq("id", p.data.id).eq("project_id", project.id);
  return error ? fail(error.message) : ok({ removed: p.data.id });
}
