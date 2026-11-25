// src/lib/actions/wedding.ts — the couple's wedding details (shared by chat tools and forms).
import { z } from "zod";
import { Category, resolveMetro } from "@/agent/shared";
import { fail, ok, parseInput, type Sb } from "./result";

export const SaveWeddingDetailsInput = z.object({
  partnerNames: z.string().optional().describe('e.g. "Priya & Sam"'),
  weddingDate: z
    .string()
    .optional()
    .describe("YYYY-MM-DD; use the 1st if only the month is known"),
  metro: z.string().optional().describe('City, e.g. "Charlotte"'),
  venue: z
    .string()
    .optional()
    .describe('Venue name once booked or chosen, e.g. "Crystal Ballroom"'),
  guestCount: z.number().int().positive().optional(),
  budgetTotal: z.number().int().positive().optional().describe("Total budget in USD"),
  style: z.string().optional().describe('Their words, e.g. "boho, outdoor"'),
  needs: z.array(Category).optional().describe("Vendor types still needed"),
});
export type SaveWeddingDetailsInput = z.input<typeof SaveWeddingDetailsInput>;

/** The couple's project row (RLS keeps it to their own), or null. */
export async function getProject(sb: Sb, userId: string) {
  const { data } = await sb
    .from("couple_projects")
    .select("*")
    .eq("couple_id", userId)
    .limit(1)
    .maybeSingle();
  return data;
}

export async function getMyWedding(sb: Sb, userId: string) {
  return ok((await getProject(sb, userId)) ?? { empty: true });
}

const WEDDING_FIELDS = [
  "partner_names",
  "wedding_date",
  "metro_slug",
  "guest_count",
  "budget_total",
  "style",
  "needs",
];

export async function saveWeddingDetails(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(SaveWeddingDetailsInput, input);
  if (!p.ok) return p;
  const i = p.data;

  let metro_slug: string | undefined;
  if (i.metro) {
    const m = await resolveMetro(sb, i.metro);
    if (!m)
      return fail(`We're not in ${i.metro} yet. Try Charlotte, Raleigh, or Greenville SC.`);
    metro_slug = m.slug;
  }
  // Keep only the fields that were sent
  const patch = Object.fromEntries(
    Object.entries({
      partner_names: i.partnerNames,
      wedding_date: i.weddingDate,
      metro_slug,
      venue: i.venue,
      guest_count: i.guestCount,
      budget_total: i.budgetTotal,
      style: i.style,
      needs: i.needs,
    }).filter(([, v]) => v !== undefined)
  );

  const existing = await getProject(sb, userId);
  const { data, error } = existing
    ? await sb.from("couple_projects").update(patch).eq("id", existing.id).select().single()
    : await sb
        .from("couple_projects")
        .insert({ couple_id: userId, ...patch })
        .select()
        .single();
  if (error) return fail(error.message);

  const missing = WEDDING_FIELDS.filter(
    (k) => !data[k] || (Array.isArray(data[k]) && data[k].length === 0)
  );
  return ok({ wedding: data, missing });
}
