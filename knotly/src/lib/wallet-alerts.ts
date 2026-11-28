// src/lib/wallet-alerts.ts — low-balance emails for Pay-as-you-go vendors (pricing-vendor-wallet-spec.md).
// take_wallet_alert() decides: 'low' under the reload threshold ($10), 'empty' under the lead fee
// ($1), at most one of each per 24 hours. Call it after anything that lowers the available balance
// (an estimate's hold, a couple opening an estimate, a wave skipping the vendor). Never throws.
import type { SupabaseClient } from "@supabase/supabase-js";
import { usd } from "@/lib/actions/wallet";

type Send = (to: string, subject: string, text: string, link: string) => Promise<unknown>;
type Pricing = { lead_fee_cents: number; reload_below_cents: number };

export function walletAlertEmail(kind: "low" | "empty", p: Pricing) {
  return kind === "empty"
    ? {
        subject: "New leads are paused",
        text: `Your Knotly balance can't cover the ${usd(p.lead_fee_cents)} lead fee, so new leads and over-limit texts are paused. Reload to start again.`,
      }
    : {
        subject: `Your Knotly balance is under ${usd(p.reload_below_cents)}`,
        text: "You can reload now, so your agent keeps sending estimates without a pause.",
      };
}

/** Returns the alert sent ('low' | 'empty') or null. Needs the service role. */
export async function sendWalletAlert(admin: SupabaseClient, vendorId: string, send: Send): Promise<"low" | "empty" | null> {
  try {
    const { data: kind } = await admin.rpc("take_wallet_alert", { v: vendorId });
    if (kind !== "low" && kind !== "empty") return null;
    const [{ data: pricing }, { data: profile }] = await Promise.all([
      admin.rpc("vendor_pricing", { p_vendor: vendorId }),
      admin.from("profiles").select("email").eq("id", vendorId).maybeSingle(),
    ]);
    const p = (Array.isArray(pricing) ? pricing[0] : pricing) as Pricing | null;
    if (!profile?.email || !p) return null;
    const { subject, text } = walletAlertEmail(kind, p);
    await send(profile.email, subject, text, `${process.env.APP_URL ?? ""}/vendor/dashboard/account`);
    return kind;
  } catch (e) {
    console.error("[wallet-alerts]", vendorId, e instanceof Error ? e.message : e);
    return null;
  }
}
