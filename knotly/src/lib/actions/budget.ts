// src/lib/actions/budget.ts — budget targets and bookings (shared by chat tools and forms).
import { z } from "zod";
import { Category } from "@/agent/shared";
import { loadBudget } from "@/lib/budget";
import { defaultBudgetSplit } from "@/lib/budget-split";
import { getProject } from "./wedding";
import { fail, ok, parseInput, type Sb } from "./result";

export const PlanBudgetInput = z.object({
  allocations: z
    .array(
      z.object({
        category: z.union([Category, z.literal("other")]),
        label: z.string().optional().describe('Only for "other", e.g. "Rings"'),
        amount: z.number().int().min(0),
      })
    )
    .min(1)
    .max(20),
  fromCouple: z
    .boolean()
    .describe("true if the couple stated these amounts; false if you're suggesting them"),
});
export type PlanBudgetInput = z.input<typeof PlanBudgetInput>;

export const RecordBookingInput = z.object({
  category: z.union([Category, z.literal("other")]),
  label: z.string().optional().describe('Only for "other", e.g. "Rings"'),
  amount: z.number().int().min(0),
  vendorId: z.string().optional().describe("The vendor's id, if booked through Knotly"),
  note: z.string().max(200).optional().describe('e.g. "Golden Hour Co., Signature package"'),
});
export type RecordBookingInput = z.input<typeof RecordBookingInput>;

export async function getBudget(sb: Sb, userId: string) {
  return ok((await loadBudget(sb, userId)) ?? { empty: true, note: "Save wedding details first." });
}

export async function planBudget(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(PlanBudgetInput, input);
  if (!p.ok) return p;
  const { allocations, fromCouple } = p.data;

  const wedding = await getProject(sb, userId);
  if (!wedding) return fail("Save wedding details first.");
  const { data: existing } = await sb
    .from("budget_items")
    .select("category, label, planned_by")
    .eq("project_id", wedding.id);
  const skipped: string[] = [];
  const rows = allocations
    .filter((a) => {
      const own = existing?.find(
        (e) => e.category === a.category && (e.label ?? null) === (a.label ?? null) && e.planned_by === "couple"
      );
      if (own && !fromCouple) skipped.push(a.label ?? a.category); // never overwrite the couple's own target
      return !(own && !fromCouple);
    })
    .map((a) => ({
      project_id: wedding.id,
      category: a.category,
      label: a.label ?? null,
      planned: a.amount,
      planned_by: fromCouple ? "couple" : "ai",
      updated_at: new Date().toISOString(),
    }));
  if (rows.length) {
    const { error } = await sb.from("budget_items").upsert(rows, { onConflict: "project_id,category,label" });
    if (error) return fail(error.message);
  }
  return ok({ budget: await loadBudget(sb, userId), keptCoupleTargets: skipped });
}

export async function recordBooking(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(RecordBookingInput, input);
  if (!p.ok) return p;
  const { category, label, amount, vendorId, note } = p.data;

  const wedding = await getProject(sb, userId);
  if (!wedding) return fail("Save wedding details first.");
  const { error } = await sb.from("budget_items").upsert(
    {
      project_id: wedding.id,
      category,
      label: label ?? null,
      booked: amount,
      booked_vendor_id: vendorId && z.uuid().safeParse(vendorId).success ? vendorId : null,
      booked_note: note ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id,category,label" }
  );
  if (error) return fail(error.message);
  return ok({ budget: await loadBudget(sb, userId) });
}

/** The non-AI "plan my budget": split the total across the needed categories. Never overwrites the couple's own targets. */
export async function applyDefaultBudgetSplit(sb: Sb, userId: string) {
  const wedding = await getProject(sb, userId);
  if (!wedding) return fail("Save wedding details first.");
  if (!wedding.budget_total) return fail("Add your total budget first.");
  const { data: needs } = await sb.from("project_needs").select("category").eq("project_id", wedding.id);
  const categories = (needs ?? []).map((n: { category: string }) => n.category);
  if (!categories.length) return fail("Choose the vendor types you need first.");
  return planBudget(sb, userId, {
    allocations: defaultBudgetSplit(wedding.budget_total, categories),
    fromCouple: false,
  });
}
