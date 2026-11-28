// src/app/api/wallet/receipt/[id]/route.ts — open the Stripe receipt for one of the vendor's reloads.
// The ledger row is read through RLS (vendors read only their own), then Stripe gives the URL.
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { fetchReceiptUrl } from "@/lib/stripe";

export async function GET(_req: Request, ctx: RouteContext<"/api/wallet/receipt/[id]">) {
  const { id } = await ctx.params;
  if (!/^\d{1,18}$/.test(id)) return new Response("Not found", { status: 404 });
  const sb = await supabaseServer();
  const { data: row } = await sb
    .from("wallet_transactions")
    .select("kind, stripe_intent")
    .eq("id", Number(id))
    .maybeSingle();
  if (!row || row.kind !== "topup" || !row.stripe_intent) return new Response("Not found", { status: 404 });
  const url = await fetchReceiptUrl(row.stripe_intent);
  if (!url) return new Response("Receipt isn't available yet. Please try again in a minute.", { status: 404 });
  redirect(url);
}
