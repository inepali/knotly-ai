// src/lib/actions/wedding.ts — the couple's wedding details (shared by the dashboard forms).
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

// The My Wedding form also sets an optional budget per needed category. `budget: null` clears it.
export const SaveWeddingFormInput = SaveWeddingDetailsInput.extend({
  needBudgets: z
    .array(z.object({ category: Category, budget: z.number().int().positive().nullable() }))
    .max(40)
    .optional(),
});
export type SaveWeddingFormInput = z.input<typeof SaveWeddingFormInput>;

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

type Needs = { needs?: string[]; needBudgets?: { category: string; budget: number | null }[] };

// Keep project_needs (one row per needed category, with its budget and estimate cap) in
// step with what was saved. A removed need loses its row; a kept one keeps its cap.
async function syncNeeds(sb: Sb, projectId: string, { needs, needBudgets }: Needs) {
  if (needs) {
    const { data: rows } = await sb.from("project_needs").select("category").eq("project_id", projectId);
    const gone = (rows ?? []).map((r: { category: string }) => r.category).filter((c) => !needs.includes(c));
    if (gone.length) {
      const { error } = await sb.from("project_needs").delete().eq("project_id", projectId).in("category", gone);
      if (error) return error.message;
    }
    if (needs.length) {
      const { error } = await sb
        .from("project_needs")
        .upsert(
          needs.map((category) => ({ project_id: projectId, category })),
          { onConflict: "project_id,category", ignoreDuplicates: true }
        );
      if (error) return error.message;
    }
  }
  for (const b of needBudgets ?? []) {
    const { error } = await sb
      .from("project_needs")
      .update({ budget: b.budget })
      .eq("project_id", projectId)
      .eq("category", b.category);
    if (error) return error.message;
  }
  return null;
}

type Saved = z.output<typeof SaveWeddingDetailsInput> & Pick<Needs, "needBudgets">;

async function persist(sb: Sb, userId: string, i: Saved) {
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

  if (i.needs || i.needBudgets?.length) {
    const needsError = await syncNeeds(sb, data.id, i);
    if (needsError) return fail(needsError);
  }

  const missing = WEDDING_FIELDS.filter(
    (k) => !data[k] || (Array.isArray(data[k]) && data[k].length === 0)
  );
  return ok({ wedding: data, missing });
}

export async function saveWeddingDetails(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(SaveWeddingDetailsInput, input);
  if (!p.ok) return p;
  return persist(sb, userId, p.data);
}

/** The My Wedding form: the same save, plus a budget per needed category. */
export async function saveWeddingForm(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(SaveWeddingFormInput, input);
  if (!p.ok) return p;
  return persist(sb, userId, p.data);
}
