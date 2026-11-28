// src/lib/actions/pricing.ts — admin-set pricing (pricing_config), per metro with a default row.
// Money is in cents here; the admin form shows dollars. Changes apply to NEW estimates, texts and
// reloads: an estimate keeps the fee it was sent with (quotes.lead_fee_cents).
import { z } from "zod";
import { fail, ok, parseInput, type Sb } from "./result";

const cents = (max: number) => z.number().int().min(0).max(max);

export const PricingInput = z
  .object({
    metroSlug: z.string().min(1).max(80).nullable(), // null = the default for every metro
    leadFeeCents: cents(10_000),
    reloadStepCents: cents(100_000).min(100),
    reloadMaxSteps: z.number().int().min(1).max(20),
    reloadBelowCents: cents(100_000),
    signupCreditCents: cents(100_000),
    smsFreeMonthly: z.number().int().min(0).max(10_000),
    smsOverageCents: cents(1_000),
  })
  .refine((p) => p.reloadStepCents * p.reloadMaxSteps <= 100_000, {
    message: "The largest reload (step × max) can't be over $1,000.",
    path: ["reloadMaxSteps"],
  });
export type PricingInput = z.input<typeof PricingInput>;

export type PricingRow = {
  metro_slug: string | null;
  lead_fee_cents: number;
  reload_step_cents: number;
  reload_max_steps: number;
  reload_below_cents: number;
  signup_credit_cents: number;
  sms_free_monthly: number;
  sms_overage_cents: number;
  updated_at: string;
};

export const toRow = (p: z.output<typeof PricingInput>) => ({
  lead_fee_cents: p.leadFeeCents,
  reload_step_cents: p.reloadStepCents,
  reload_max_steps: p.reloadMaxSteps,
  reload_below_cents: p.reloadBelowCents,
  signup_credit_cents: p.signupCreditCents,
  sms_free_monthly: p.smsFreeMonthly,
  sms_overage_cents: p.smsOverageCents,
});

/** Default row first, then metro overrides; plus metros without one. Service-role read. */
export async function loadPricing(admin: Sb) {
  const [{ data: rows }, { data: metros }] = await Promise.all([
    admin
      .from("pricing_config")
      .select("metro_slug, lead_fee_cents, reload_step_cents, reload_max_steps, reload_below_cents, signup_credit_cents, sms_free_monthly, sms_overage_cents, updated_at")
      .order("metro_slug", { ascending: true, nullsFirst: true }),
    admin.from("metros").select("slug, name, state").order("name"),
  ]);
  const all = (rows ?? []) as PricingRow[];
  const used = new Set(all.map((r) => r.metro_slug));
  return {
    rows: all,
    metros: (metros ?? []) as { slug: string; name: string; state: string }[],
    metrosWithoutOverride: ((metros ?? []) as { slug: string; name: string; state: string }[]).filter((m) => !used.has(m.slug)),
  };
}

/** Save the default row or a metro's override (created if missing). */
export async function savePricing(admin: Sb, adminId: string, input: unknown) {
  const p = parseInput(PricingInput, input);
  if (!p.ok) return p;
  const row = { ...toRow(p.data), updated_at: new Date().toISOString(), updated_by: adminId };
  if (p.data.metroSlug === null) {
    const { error } = await admin.from("pricing_config").update(row).is("metro_slug", null);
    return error ? fail(error.message) : ok({ saved: "default" });
  }
  const { data: metro } = await admin.from("metros").select("slug").eq("slug", p.data.metroSlug).maybeSingle();
  if (!metro) return fail("That metro doesn't exist.");
  const { error } = await admin
    .from("pricing_config")
    .upsert({ metro_slug: p.data.metroSlug, ...row }, { onConflict: "metro_slug" });
  return error ? fail(error.message) : ok({ saved: p.data.metroSlug });
}

export const RemoveMetroPricingInput = z.object({ metroSlug: z.string().min(1).max(80) });

/** Drop a metro's override: it goes back to the default prices. The default row can't be removed. */
export async function removeMetroPricing(admin: Sb, input: unknown) {
  const p = parseInput(RemoveMetroPricingInput, input);
  if (!p.ok) return p;
  const { error } = await admin.from("pricing_config").delete().eq("metro_slug", p.data.metroSlug);
  return error ? fail(error.message) : ok({ removed: p.data.metroSlug });
}

/** "12.50" → 1250; "" / junk → NaN (the schema then refuses it). */
export const dollarsToCents = (s: string) => {
  const t = s.trim().replace(/^\$/, "");
  return /^\d+(\.\d{1,2})?$/.test(t) ? Math.round(Number(t) * 100) : Number.NaN;
};
export const centsToDollars = (c: number) => (c / 100).toFixed(2);
