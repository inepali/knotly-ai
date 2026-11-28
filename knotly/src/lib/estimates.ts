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

// Opening an estimate (the paid moment) unlocks the vendor's contact details and, on a posted
// project, personal messages. Conversations the couple started are always open for messages.
export type VendorContact = {
  vendorId: string;
  businessName: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
};

export const lockedReplyNotice = (side: Side) =>
  side === "couple"
    ? "Open the estimate to message this vendor and see their contact details."
    : "You can message the couple once they open your estimate.";

type ContactRow = {
  vendor_id: string;
  business_name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
};

/** Whether this viewer may send messages here, and the vendor's contact card if unlocked for them. */
export async function loadThreadUnlock(sb: SupabaseClient, threadId: string) {
  const [{ data: open }, { data: rows }] = await Promise.all([
    sb.rpc("thread_messaging_open", { t: threadId }),
    sb.rpc("thread_vendor_contact", { t: threadId }),
  ]);
  const row = (Array.isArray(rows) ? rows[0] : rows) as ContactRow | null | undefined;
  const contact: VendorContact | null = row?.vendor_id
    ? {
        vendorId: row.vendor_id,
        businessName: row.business_name,
        phone: row.phone,
        email: row.email,
        website: row.website,
        instagram: row.instagram,
      }
    : null;
  return { messagingOpen: open === true, contact };
}
