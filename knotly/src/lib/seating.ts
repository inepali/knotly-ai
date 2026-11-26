// src/lib/seating.ts — Seating Chart rules with no database: who needs a seat, table loads,
// warnings, "seat households together", and the escort-card list.
import { toCsv } from "./guests";

export type SeatingTable = { id: string; name: string; shape: "round" | "long"; capacity: number; sort: number };
export type Assignment = { table_id: string; household_id: string; guest_id: string | null; plus_index: number | null };
/** Someone who needs a seat. key = "g:<guestId>" or "p:<householdId>:<index>". */
export type Seatable = { key: string; household_id: string; household: string; name: string; guest_id: string | null; plus_index: number | null; is_child: boolean };

export const seatKey = (a: Pick<Assignment, "household_id" | "guest_id" | "plus_index">) =>
  a.guest_id ? `g:${a.guest_id}` : `p:${a.household_id}:${a.plus_index}`;

type HouseholdIn = {
  id: string;
  label: string;
  plus_ones: number;
  guests: { id: string; first_name: string; last_name: string; is_child: boolean }[];
};

/**
 * Who to seat. With RSVP answers: guests attending at least one event, plus the plus-ones they named.
 * Without RSVP: everyone invited, plus a placeholder for each allowed plus-one.
 */
export function seatables(
  households: HouseholdIn[],
  rsvp: { attending: Set<string>; plusOnes: Map<string, { name: string }[]>; responded: Set<string> } | null
): Seatable[] {
  const out: Seatable[] = [];
  for (const h of households) {
    if (rsvp && rsvp.responded.has(h.id)) {
      for (const g of h.guests) if (rsvp.attending.has(g.id)) out.push(guestSeat(h, g));
      (rsvp.plusOnes.get(h.id) ?? []).slice(0, 5).forEach((p, i) => out.push(plusSeat(h, i, p.name)));
    } else {
      for (const g of h.guests) out.push(guestSeat(h, g));
      for (let i = 0; i < Math.min(h.plus_ones, 5); i++) out.push(plusSeat(h, i, `Guest of ${h.guests[0]?.first_name ?? h.label}`));
    }
  }
  return out;
}
const guestSeat = (h: HouseholdIn, g: HouseholdIn["guests"][number]): Seatable => ({
  key: `g:${g.id}`,
  household_id: h.id,
  household: h.label,
  name: `${g.first_name} ${g.last_name}`.trim(),
  guest_id: g.id,
  plus_index: null,
  is_child: g.is_child,
});
const plusSeat = (h: HouseholdIn, i: number, name: string): Seatable => ({
  key: `p:${h.id}:${i}`,
  household_id: h.id,
  household: h.label,
  name,
  guest_id: null,
  plus_index: i,
  is_child: false,
});

export type Plan = {
  byTable: Map<string, Seatable[]>;
  unseated: Seatable[];
  warnings: { tableId: string | null; text: string }[];
};

/** Who sits where, who's left, and what looks off. Assignments for people no longer coming are ignored. */
export function plan(tables: SeatingTable[], people: Seatable[], assignments: Assignment[]): Plan {
  const where = new Map(assignments.map((a) => [seatKey(a), a.table_id]));
  const byTable = new Map<string, Seatable[]>(tables.map((t) => [t.id, []]));
  const unseated: Seatable[] = [];
  for (const p of people) {
    const t = where.get(p.key);
    if (t && byTable.has(t)) byTable.get(t)!.push(p);
    else unseated.push(p);
  }
  const warnings: Plan["warnings"] = [];
  for (const t of tables) {
    const n = byTable.get(t.id)!.length;
    if (n > t.capacity) warnings.push({ tableId: t.id, text: `${t.name} has ${n} people for ${t.capacity} seats.` });
  }
  const tablesOf = new Map<string, Set<string>>();
  for (const [tid, ps] of byTable) for (const p of ps) (tablesOf.get(p.household_id) ?? tablesOf.set(p.household_id, new Set()).get(p.household_id)!).add(tid);
  for (const [hid, set] of tablesOf) {
    if (set.size > 1) {
      const label = people.find((p) => p.household_id === hid)?.household ?? "A household";
      warnings.push({ tableId: null, text: `${label} is split across ${set.size} tables.` });
    }
  }
  return { byTable, unseated, warnings };
}

/**
 * Seat everyone who isn't seated, keeping households together: biggest households first,
 * into the table with the least room that still fits them. Households too big for any table are left.
 */
export function autoSeat(tables: SeatingTable[], p: Plan): Assignment[] {
  const free = new Map(tables.map((t) => [t.id, t.capacity - (p.byTable.get(t.id)?.length ?? 0)]));
  const groups = new Map<string, Seatable[]>();
  for (const s of p.unseated) (groups.get(s.household_id) ?? groups.set(s.household_id, []).get(s.household_id)!).push(s);
  const out: Assignment[] = [];
  for (const group of [...groups.values()].sort((a, b) => b.length - a.length)) {
    // Prefer a table this household already sits at.
    const already = tables.find((t) => p.byTable.get(t.id)?.some((x) => x.household_id === group[0].household_id) && free.get(t.id)! >= group.length);
    const fit = already ?? tables.filter((t) => free.get(t.id)! >= group.length).sort((a, b) => free.get(a.id)! - free.get(b.id)! || a.sort - b.sort)[0];
    if (!fit) continue;
    free.set(fit.id, free.get(fit.id)! - group.length);
    for (const s of group) out.push({ table_id: fit.id, household_id: s.household_id, guest_id: s.guest_id, plus_index: s.plus_index });
  }
  return out;
}

/** Alphabetical by last name: "Name → Table", for escort cards. */
export function escortList(tables: SeatingTable[], p: Plan): { name: string; table: string }[] {
  const rows: { name: string; table: string; sortKey: string }[] = [];
  for (const t of tables)
    for (const s of p.byTable.get(t.id) ?? []) {
      const parts = s.name.split(/\s+/);
      rows.push({ name: s.name, table: t.name, sortKey: `${parts.at(-1)} ${parts.slice(0, -1).join(" ")}`.toLowerCase() });
    }
  return rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey)).map(({ name, table }) => ({ name, table }));
}

export const escortCsv = (tables: SeatingTable[], p: Plan) => toCsv([["Name", "Table"], ...escortList(tables, p).map((r) => [r.name, r.table])]);
