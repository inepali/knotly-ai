"use server";
// src/app/inbox/actions.ts — the couple opens an estimate (the paid moment).
// view_quote() runs as the signed-in user, so RLS and its ownership check decide; it charges the
// vendor once. Afterwards the vendor may be due a low-balance email.
import { after } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notify } from "@/lib/email";
import { sendWalletAlert } from "@/lib/wallet-alerts";
import type { EstimateLine } from "@/lib/estimates";

type Opened = { ok: true; total: number; lines: EstimateLine[] } | { ok: false; error: string };

export async function openEstimateAction(quoteId: string): Promise<Opened> {
  const fail = { ok: false as const, error: "We couldn't open this estimate. Please try again." };
  if (!z.uuid().safeParse(quoteId).success) return fail;
  const sb = await supabaseServer();
  const [{ data: { user } }, { data, error }] = await Promise.all([
    sb.auth.getUser(),
    sb.rpc("view_quote", { p_quote: quoteId }),
  ]);
  const row = (Array.isArray(data) ? data[0] : data) as { total: number; line_items: EstimateLine[] } | undefined;
  if (error || !row) return fail;

  after(async () => {
    const { data: q } = await supabaseAdmin.from("quotes").select("threads(vendor_id)").eq("id", quoteId).maybeSingle();
    const vendorId = (q?.threads as unknown as { vendor_id: string } | null)?.vendor_id;
    if (vendorId && vendorId !== user?.id) await sendWalletAlert(supabaseAdmin, vendorId, notify);
  });
  return { ok: true, total: row.total, lines: row.line_items };
}
