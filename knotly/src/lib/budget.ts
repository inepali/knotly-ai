// src/lib/budget.ts — the couple's budget: planned targets and bookings (budget_items)
// plus vendor quotes (read live from `quotes`). Used by the assistant's budget tools and
// the Budget tab; pass the signed-in user's client so RLS keeps it to their own wedding.
import type { SupabaseClient } from "@supabase/supabase-js";

export type BudgetQuote = {
  vendor: string;
  total: number | null; // null until the couple opens it (opening is when the vendor is charged)
  validUntil: string;
  status: string;
  threadId: string;
};

export type BudgetLine = {
  category: string;
  label: string | null;
  planned: number | null;
  plannedBy: "ai" | "couple" | null;
  booked: number | null;
  bookedNote: string | null;
  quotes: BudgetQuote[];
  // Best current figure: booked, else the lowest opened quote, else the plan.
  current: number | null;
  basis: "booked" | "quote" | "planned" | null;
};

export type Budget = {
  budgetTotal: number | null;
  lines: BudgetLine[];
  totals: { current: number; booked: number; remaining: number | null; percentUsed: number | null };
};

type ItemRow = {
  category: string;
  label: string | null;
  planned: number | null;
  planned_by: "ai" | "couple" | null;
  booked: number | null;
  booked_note: string | null;
};
type QuoteRow = {
  total: number;
  valid_until: string;
  status: string;
  first_viewed_at: string | null;
  thread_id: string;
  threads: { project_id: string; vendors: { business_name: string; category: string } | null } | null;
};

export function summarizeBudget(budgetTotal: number | null, items: ItemRow[], quoteRows: QuoteRow[]): Budget {
  const key = (category: string, label: string | null) => `${category}|${label ?? ""}`;
  const lines = new Map<string, BudgetLine>();
  const line = (category: string, label: string | null) => {
    const k = key(category, label);
    if (!lines.has(k))
      lines.set(k, {
        category,
        label,
        planned: null,
        plannedBy: null,
        booked: null,
        bookedNote: null,
        quotes: [],
        current: null,
        basis: null,
      });
    return lines.get(k)!;
  };

  for (const i of items) {
    const l = line(i.category, i.label);
    l.planned = i.planned;
    l.plannedBy = i.planned_by;
    l.booked = i.booked;
    l.bookedNote = i.booked_note;
  }
  for (const q of quoteRows) {
    const vendor = q.threads?.vendors;
    if (!vendor || q.status === "declined" || q.status === "expired") continue;
    line(vendor.category, null).quotes.push({
      vendor: vendor.business_name,
      total: q.first_viewed_at ? q.total : null,
      validUntil: q.valid_until,
      status: q.status,
      threadId: q.thread_id,
    });
  }

  for (const l of lines.values()) {
    const opened = l.quotes.map((q) => q.total).filter((t): t is number => t != null);
    if (l.booked != null) [l.current, l.basis] = [l.booked, "booked"];
    else if (opened.length) [l.current, l.basis] = [Math.min(...opened), "quote"];
    else if (l.planned != null) [l.current, l.basis] = [l.planned, "planned"];
  }

  const all = [...lines.values()].sort((a, b) => (b.current ?? 0) - (a.current ?? 0));
  const current = all.reduce((s, l) => s + (l.current ?? 0), 0);
  const booked = all.reduce((s, l) => s + (l.booked ?? 0), 0);
  return {
    budgetTotal,
    lines: all,
    totals: {
      current,
      booked,
      remaining: budgetTotal != null ? budgetTotal - current : null,
      percentUsed: budgetTotal ? Math.round((current / budgetTotal) * 100) : null,
    },
  };
}

// The signed-in couple's budget (null if they have no wedding saved yet).
export async function loadBudget(sb: SupabaseClient, coupleId: string) {
  const { data: project } = await sb
    .from("couple_projects")
    .select("id, budget_total")
    .eq("couple_id", coupleId)
    .limit(1)
    .maybeSingle();
  if (!project) return null;

  const [{ data: items }, { data: quotes }] = await Promise.all([
    sb.from("budget_items").select("category, label, planned, planned_by, booked, booked_note").eq("project_id", project.id),
    sb
      .from("quotes")
      .select(
        "total, valid_until, status, first_viewed_at, thread_id, threads!inner(project_id, vendors(business_name, category))"
      )
      .eq("threads.project_id", project.id),
  ]);
  return {
    projectId: project.id as string,
    ...summarizeBudget(project.budget_total, (items ?? []) as ItemRow[], (quotes ?? []) as unknown as QuoteRow[]),
  };
}
