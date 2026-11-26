// src/lib/actions/seating.ts — Seating Chart (add-on): tables and seats.
import { z } from "zod";
import { loadRsvpData } from "@/lib/rsvp-data";
import { seatables, type Assignment, type SeatingTable } from "@/lib/seating";
import { getProject } from "./wedding";
import { fail, ok, parseInput, type Sb } from "./result";

const LOCKED = "Unlock the Seating Chart add-on first.";
const NO_PROJECT = "Save your wedding details on My Wedding first.";

export const SaveTableInput = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Give the table a name.").max(40),
  shape: z.enum(["round", "long"]).default("round"),
  capacity: z.number().int().min(1).max(40),
});
export type SaveTableInput = z.input<typeof SaveTableInput>;
export const AddTablesInput = z.object({ count: z.number().int().min(1).max(50), capacity: z.number().int().min(1).max(40), shape: z.enum(["round", "long"]) });
export type AddTablesInput = z.input<typeof AddTablesInput>;
export const SeatInput = z.object({
  household_id: z.uuid(),
  guest_id: z.uuid().nullable(),
  plus_index: z.number().int().min(0).max(4).nullable(),
  table_id: z.uuid().nullable(), // null = unseat
});
export const SetSeatsInput = z.object({ seats: z.array(SeatInput).min(1).max(1000) });
export type SetSeatsInput = z.input<typeof SetSeatsInput>;
export const TableIdInput = z.object({ id: z.uuid() });
export type TableIdInput = z.input<typeof TableIdInput>;

async function ctx(sb: Sb, userId: string) {
  const project = await getProject(sb, userId);
  if (!project) return null;
  const [{ data: active }, { data: rsvp }] = await Promise.all([
    sb.rpc("has_addon", { p_project: project.id, p_key: "seating" }),
    sb.rpc("has_addon", { p_project: project.id, p_key: "rsvp" }),
  ]);
  return { projectId: project.id as string, active: !!active, rsvp: !!rsvp };
}

export async function loadSeating(sb: Sb, userId: string) {
  const c = await ctx(sb, userId);
  if (!c) return fail(NO_PROJECT);
  const [{ data: tables }, data] = await Promise.all([
    sb.from("seating_tables").select("id, name, shape, capacity, sort").eq("project_id", c.projectId).order("sort").order("created_at"),
    loadRsvpData(sb, c.projectId),
  ]);
  const tableIds = (tables ?? []).map((t) => t.id as string);
  const { data: seats } = tableIds.length
    ? await sb.from("seating_assignments").select("table_id, household_id, guest_id, plus_index").in("table_id", tableIds)
    : { data: [] };

  // With RSVP: seat people who said yes to at least one event (households that haven't answered are seated as invited).
  const rsvp = c.rsvp
    ? {
        attending: new Set(data.responses.filter((r) => r.status === "attending").map((r) => r.guest_id)),
        plusOnes: new Map([...data.answers].filter(([, a]) => a.responded_at).map(([h, a]) => [h, a.plus_ones])),
        responded: new Set([...data.answers].filter(([, a]) => a.responded_at).map(([h]) => h)),
      }
    : null;
  return ok({
    active: c.active,
    usesRsvp: c.rsvp,
    tables: (tables ?? []) as SeatingTable[],
    assignments: (seats ?? []) as Assignment[],
    people: seatables(data.households, rsvp),
  });
}

async function writable(sb: Sb, userId: string) {
  const c = await ctx(sb, userId);
  if (!c) return { error: NO_PROJECT } as const;
  if (!c.active) return { error: LOCKED } as const;
  return c;
}

export async function saveTable(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(SaveTableInput, input);
  if (!p.ok) return p;
  const c = await writable(sb, userId);
  if ("error" in c) return fail(c.error!);
  const { id, ...row } = p.data;
  if (id) {
    const { data, error } = await sb.from("seating_tables").update(row).eq("id", id).eq("project_id", c.projectId).select("id");
    if (error) return fail(error.message);
    return data?.length ? ok({ id }) : fail("Table not found.");
  }
  const { count } = await sb.from("seating_tables").select("id", { count: "exact", head: true }).eq("project_id", c.projectId);
  const { data, error } = await sb.from("seating_tables").insert({ ...row, project_id: c.projectId, sort: count ?? 0 }).select("id").single();
  return error ? fail(error.message.includes("seating_limit") ? "You can have up to 100 tables." : error.message) : ok({ id: (data as { id: string }).id });
}

/** Quick start: "Table 1" … "Table N" after the existing tables. */
export async function addTables(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(AddTablesInput, input);
  if (!p.ok) return p;
  const c = await writable(sb, userId);
  if ("error" in c) return fail(c.error!);
  const { count } = await sb.from("seating_tables").select("id", { count: "exact", head: true }).eq("project_id", c.projectId);
  const start = count ?? 0;
  if (start + p.data.count > 100) return fail("You can have up to 100 tables.");
  const rows = Array.from({ length: p.data.count }, (_, i) => ({
    project_id: c.projectId,
    name: `Table ${start + i + 1}`,
    shape: p.data.shape,
    capacity: p.data.capacity,
    sort: start + i,
  }));
  const { error } = await sb.from("seating_tables").insert(rows);
  return error ? fail(error.message) : ok({ added: rows.length });
}

export async function deleteTable(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(TableIdInput, input);
  if (!p.ok) return p;
  const c = await ctx(sb, userId);
  if (!c) return fail(NO_PROJECT);
  const { error } = await sb.from("seating_tables").delete().eq("id", p.data.id).eq("project_id", c.projectId);
  return error ? fail(error.message) : ok({ removed: p.data.id });
}

/** Move people to a table (or off every table). RLS checks the table and household are this wedding's. */
export async function setSeats(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(SetSeatsInput, input);
  if (!p.ok) return p;
  if (p.data.seats.some((s) => (s.guest_id === null) === (s.plus_index === null))) return fail("Each seat is a guest or a plus-one.");
  const c = await writable(sb, userId);
  if ("error" in c) return fail(c.error!);

  const guestIds = p.data.seats.filter((s) => s.guest_id).map((s) => s.guest_id!);
  if (guestIds.length) {
    const { error } = await sb.from("seating_assignments").delete().in("guest_id", guestIds);
    if (error) return fail(error.message);
  }
  for (const s of p.data.seats.filter((x) => x.plus_index !== null)) {
    const { error } = await sb.from("seating_assignments").delete().eq("household_id", s.household_id).eq("plus_index", s.plus_index!);
    if (error) return fail(error.message);
  }
  const rows = p.data.seats.filter((s) => s.table_id).map(({ table_id, household_id, guest_id, plus_index }) => ({ table_id: table_id!, household_id, guest_id, plus_index }));
  if (rows.length) {
    const { error } = await sb.from("seating_assignments").insert(rows);
    if (error) return fail(error.message);
  }
  return ok({ seated: rows.length });
}
