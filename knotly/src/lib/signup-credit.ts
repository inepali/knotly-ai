// src/lib/signup-credit.ts — the vendor's $10 signup credit (pricing-vendor-wallet-spec.md).
// grant_signup_credit() decides eligibility (a verified email or phone, once per vendor, inbox,
// phone and business) and is safe to call again, so callers try it wherever it could first apply:
// right after the sign-up code is verified, and when the vendor first saves their business.
// Never throws: a sign-up or a save must not fail because of the credit.
import type { SupabaseClient } from "@supabase/supabase-js";

/** Cents granted now (0 when not eligible yet, already claimed, or on error). Needs the service role. */
export async function grantSignupCredit(admin: SupabaseClient, vendorId: string): Promise<number> {
  const { data, error } = await admin.rpc("grant_signup_credit", { p_vendor: vendorId });
  if (error) {
    // No business row yet is expected right after sign-up; the business save tries again.
    if (!/vendor not found/i.test(error.message)) console.error("[signup-credit]", error.message);
    return 0;
  }
  return typeof data === "number" && data > 0 ? data : 0;
}

/** "You have $10 in free credit, about 10 leads." */
export function signupCreditNotice(cents: number, leadFeeCents = 100): string {
  const dollars = cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
  const leads = leadFeeCents > 0 ? Math.floor(cents / leadFeeCents) : 0;
  return leads > 0
    ? `You have ${dollars} in free credit, about ${leads} lead${leads === 1 ? "" : "s"}.`
    : `You have ${dollars} in free credit.`;
}
