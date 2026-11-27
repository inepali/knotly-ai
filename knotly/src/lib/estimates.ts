// src/lib/estimates.ts — estimates (quotes) shown inside a conversation.
// A couple sees the price only after opening the estimate through view_quote(), which charges the
// vendor once (first open). The vendor always sees their own estimates in full.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Side } from "./mailbox";

export type EstimateLine = { label: string; amount: number };
export type Estimate = {
  id: string;
  status: string; // sent | accepted | declined | expired
  validUntil: string; // YYYY-MM-DD
  createdAt: string;
  opened: boolean; // the couple has opened it (price visible to them)
  /** Present for the vendor, and for the couple once opened. */
  total: number | null;
  lines: EstimateLine[] | null;
};

type Row = {
  id: string;
  status: string;
  valid_until: string;
  created_at: string;
  first_viewed_at: string | null;
  total?: number;
  line_items?: EstimateLine[];
};

export const isExpired = (e: Pick<Estimate, "status" | "validUntil">, today = new Date().toISOString().slice(0, 10)) =>
  e.status === "expired" || e.validUntil < today;

/** The thread's estimates, oldest first. Prices only when this viewer may see them. */
export async function loadThreadEstimates(sb: SupabaseClient, side: Side, threadId: string): Promise<Estimate[]> {
  const full = side === "vendor";
  const { data } = await sb
    .from("quotes")
    .select(full ? "id, status, valid_until, created_at, first_viewed_at, total, line_items" : "id, status, valid_until, created_at, first_viewed_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as unknown as Row[];
  // Couple: prices only for estimates they've already opened (no new charge: view_quote is only
  // called when they press the button).
  const opened = full ? [] : rows.filter((r) => r.first_viewed_at).map((r) => r.id);
  const prices = new Map<string, Row>();
  if (opened.length) {
    const { data: p } = await sb.from("quotes").select("id, total, line_items").in("id", opened);
    for (const r of (p ?? []) as unknown as Row[]) prices.set(r.id, r);
  }
  return rows.map((r) => {
    const priced = full ? r : prices.get(r.id);
    return {
      id: r.id,
      status: r.status,
      validUntil: r.valid_until,
      createdAt: r.created_at,
      opened: !!r.first_viewed_at,
      total: priced?.total ?? null,
      lines: priced?.line_items ?? null,
    };
  });
}
