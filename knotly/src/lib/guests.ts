// src/lib/guests.ts — Guest List helpers with no database: totals, labels, and CSV import/export.

export type Side = "a" | "b" | "both";
export type Address = { street?: string; city?: string; state?: string; zip?: string };
export type Guest = {
  id?: string;
  first_name: string;
  last_name: string;
  is_child: boolean;
  email: string | null;
  phone: string | null;
};
export type Household = {
  id?: string;
  label: string;
  side: Side;
  tags: string[];
  plus_ones: number;
  address: Address;
  notes: string | null;
  guests: Guest[];
  event_ids: string[];
};
export type WeddingEvent = { id: string; name: string; starts_at: string | null; venue: string | null; sort: number };

export const GUEST_LIMIT = 1000;

/** "Priya & Sam" → ["Priya", "Sam"]; falls back to Partner A / Partner B. */
export function sideNames(partnerNames: string | null | undefined): Record<Side, string> {
  const [a, b] = (partnerNames ?? "").split(/\s*(?:&|\+|\band\b)\s*/i).map((s) => s.trim()).filter(Boolean);
  return { a: a || "Partner A", b: b || "Partner B", both: "Both" };
}

/** "The Smiths" when everyone shares a last name, otherwise "Ana & Ben", otherwise the first name. */
export function defaultLabel(guests: Pick<Guest, "first_name" | "last_name">[]): string {
  const g = guests.filter((x) => x.first_name.trim());
  if (!g.length) return "New household";
  const last = g[0].last_name.trim();
  if (g.length > 1 && last && g.every((x) => x.last_name.trim().toLowerCase() === last.toLowerCase())) {
    return `The ${last.endsWith("s") ? last : `${last}s`}`;
  }
  if (g.length === 2) return `${g[0].first_name.trim()} & ${g[1].first_name.trim()}`;
  return [g[0].first_name, g[0].last_name].map((s) => s.trim()).filter(Boolean).join(" ") + (g.length > 2 ? " & family" : "");
}

export type Totals = {
  households: number;
  guests: number;
  adults: number;
  kids: number;
  plusOnes: number;
  invited: number; // guests + plus-one allowances
  bySide: Record<Side, number>;
  byEvent: Record<string, number>;
};

export function guestTotals(households: Household[]): Totals {
  const t: Totals = { households: households.length, guests: 0, adults: 0, kids: 0, plusOnes: 0, invited: 0, bySide: { a: 0, b: 0, both: 0 }, byEvent: {} };
  for (const h of households) {
    const n = h.guests.length;
    const kids = h.guests.filter((g) => g.is_child).length;
    t.guests += n;
    t.kids += kids;
    t.adults += n - kids;
    t.plusOnes += h.plus_ones;
    t.bySide[h.side] += n + h.plus_ones;
    for (const e of h.event_ids) t.byEvent[e] = (t.byEvent[e] ?? 0) + n + h.plus_ones;
  }
  t.invited = t.guests + t.plusOnes;
  return t;
}

/** Simple case-insensitive search over names, label, tags, email and city. */
export function matchesSearch(h: Household, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const hay = [h.label, h.address.city, ...h.tags, ...h.guests.flatMap((g) => [g.first_name, g.last_name, g.email ?? ""])]
    .join(" ")
    .toLowerCase();
  return s.split(/\s+/).every((w) => hay.includes(w));
}

// ---------- CSV ----------

/** RFC 4180-ish parser: quotes, escaped quotes, commas and newlines inside quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") row.push(cell), (cell = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell), rows.push(row), (row = []), (cell = "");
    } else cell += c;
  }
  if (cell !== "" || row.length) row.push(cell), rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const cellOut = (v: string) => {
  // Neutralize spreadsheet formulas, then quote when needed.
  const formula = /^[=@\t\r]/.test(v) || (/^[+-]/.test(v) && !/^[+-]?[\d\s().-]+$/.test(v));
  const safe = formula ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export const toCsv = (rows: string[][]) => rows.map((r) => r.map(cellOut).join(",")).join("\r\n") + "\r\n";

export const CSV_COLUMNS = [
  "Household",
  "First name",
  "Last name",
  "Child",
  "Email",
  "Phone",
  "Side",
  "Tags",
  "Plus-ones",
  "Street",
  "City",
  "State",
  "Zip",
] as const;
type Col = (typeof CSV_COLUMNS)[number];

const ALIASES: Record<Col, string[]> = {
  Household: ["household", "household name", "party", "family", "group name", "invitation"],
  "First name": ["first name", "first", "firstname", "given name", "name"],
  "Last name": ["last name", "last", "lastname", "surname", "family name"],
  Child: ["child", "kid", "is child", "under 18", "age group"],
  Email: ["email", "e-mail", "email address"],
  Phone: ["phone", "mobile", "cell", "phone number"],
  Side: ["side", "guest of", "whose guest"],
  Tags: ["tags", "group", "groups", "category"],
  "Plus-ones": ["plus-ones", "plus ones", "plus one", "+1", "plusones"],
  Street: ["street", "address", "address 1", "street address"],
  City: ["city", "town"],
  State: ["state", "province", "region"],
  Zip: ["zip", "zip code", "postal code", "postcode"],
};

/** Which column index holds each field, from the header row. */
export function mapHeader(header: string[]): Partial<Record<Col, number>> {
  const norm = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, " "));
  const out: Partial<Record<Col, number>> = {};
  for (const col of CSV_COLUMNS) {
    const i = norm.findIndex((h) => ALIASES[col].includes(h));
    if (i >= 0 && !Object.values(out).includes(i)) out[col] = i;
  }
  return out;
}

const yes = (v: string) => /^(y|yes|true|1|x|child|kid)$/i.test(v.trim());
function toSide(v: string, names: Record<Side, string>): Side {
  const s = v.trim().toLowerCase();
  if (!s || s === "both" || s === "mutual") return "both";
  if (s === "a" || s === names.a.toLowerCase() || s.startsWith("bride")) return "a";
  if (s === "b" || s === names.b.toLowerCase() || s.startsWith("groom")) return "b";
  return "both";
}

export type ImportPreview = {
  households: Household[];
  recognized: Col[];
  skipped: number; // rows with no first name
  problems: string[];
};

/**
 * Turn CSV text into households. Rows with the same Household value (or, without that column,
 * the same last name + street) are grouped into one household.
 */
export function previewImport(text: string, partnerNames?: string | null): ImportPreview {
  const rows = parseCsv(text);
  const problems: string[] = [];
  if (rows.length < 2) return { households: [], recognized: [], skipped: 0, problems: ["Add a header row and at least one guest."] };
  const map = mapHeader(rows[0]);
  const recognized = CSV_COLUMNS.filter((c) => map[c] !== undefined);
  if (map["First name"] === undefined) {
    return { households: [], recognized, skipped: 0, problems: ['We need a "First name" column.'] };
  }
  const names = sideNames(partnerNames);
  const get = (r: string[], c: Col) => (map[c] === undefined ? "" : (r[map[c]!] ?? "").trim());
  const groups = new Map<string, Household>();
  let skipped = 0;

  for (const r of rows.slice(1)) {
    let first = get(r, "First name");
    let last = get(r, "Last name");
    // A single "Name" column: split "Ana Lopez" into first/last.
    if (map["Last name"] === undefined && first.includes(" ")) {
      const parts = first.split(/\s+/);
      last = parts.pop()!;
      first = parts.join(" ");
    }
    if (!first) {
      skipped++;
      continue;
    }
    const street = get(r, "Street");
    const household = get(r, "Household");
    // Same household name, or same last name + street; otherwise its own household.
    const key = household
      ? `h:${household.toLowerCase()}`
      : last && street
        ? `n:${last.toLowerCase()}|${street.toLowerCase()}`
        : `row:${groups.size}:${first}`;
    let h = groups.get(key);
    if (!h) {
      h = {
        label: household,
        side: toSide(get(r, "Side"), names),
        tags: get(r, "Tags").split(/[;|]/).map((t) => t.trim()).filter(Boolean).slice(0, 10),
        plus_ones: Math.min(5, Math.max(0, parseInt(get(r, "Plus-ones"), 10) || 0)),
        address: Object.fromEntries(
          (["Street", "City", "State", "Zip"] as const).map((c) => [c.toLowerCase(), get(r, c)]).filter(([, v]) => v)
        ),
        notes: null,
        guests: [],
        event_ids: [],
      };
      groups.set(key, h);
    }
    h.guests.push({
      first_name: first.slice(0, 60),
      last_name: last.slice(0, 60),
      is_child: yes(get(r, "Child")),
      email: get(r, "Email") || null,
      phone: get(r, "Phone") || null,
    });
  }
  const households = [...groups.values()].map((h) => ({ ...h, label: (h.label || defaultLabel(h.guests)).slice(0, 120) }));
  if (skipped) problems.push(`${skipped} row${skipped === 1 ? "" : "s"} had no first name and will be skipped.`);
  return { households, recognized, skipped, problems };
}

/** One row per guest, in the same columns as the import template (so it round-trips). */
export function exportCsv(households: Household[], partnerNames?: string | null): string {
  const names = sideNames(partnerNames);
  const rows: string[][] = [[...CSV_COLUMNS]];
  for (const h of households) {
    for (const g of h.guests) {
      rows.push([
        h.label,
        g.first_name,
        g.last_name,
        g.is_child ? "yes" : "",
        g.email ?? "",
        g.phone ?? "",
        h.side === "both" ? "both" : names[h.side],
        h.tags.join("; "),
        String(h.plus_ones || ""),
        h.address.street ?? "",
        h.address.city ?? "",
        h.address.state ?? "",
        h.address.zip ?? "",
      ]);
    }
  }
  return toCsv(rows);
}

export const TEMPLATE_CSV = toCsv([
  [...CSV_COLUMNS],
  ["The Patels", "Ravi", "Patel", "", "ravi@example.com", "", "a", "Family", "0", "12 Oak St", "Charlotte", "NC", "28202"],
  ["The Patels", "Mira", "Patel", "yes", "", "", "a", "Family", "0", "12 Oak St", "Charlotte", "NC", "28202"],
  ["", "Jordan", "Lee", "", "", "", "b", "College", "1", "", "Raleigh", "NC", ""],
]);
