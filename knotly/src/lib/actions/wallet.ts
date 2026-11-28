// src/lib/actions/wallet.ts — the vendor's wallet (pricing-vendor-wallet-spec.md).
// Reloads: $20 steps up to the max, only while the balance is under the threshold (default $10).
// Amounts come from pricing_config on the server; the browser only says how many steps.
import { z } from "zod";
import { fail, ok, parseInput, type Sb } from "./result";
import type { SessionResult, WalletReloadParams } from "@/lib/stripe";

export const StartWalletReloadInput = z.object({ steps: z.number().int().min(1).max(20) });
export type StartWalletReloadInput = z.input<typeof StartWalletReloadInput>;

type Pricing = { reload_step_cents: number; reload_max_steps: number; reload_below_cents: number };

export type ReloadDeps = {
  createSession: (p: WalletReloadParams) => Promise<SessionResult>;
  siteUrl: string;
};

export const usd = (cents: number) => (cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`);

/** Start Stripe Checkout for a reload. The webhook credits the wallet (credit_wallet). */
export async function startWalletReload(sb: Sb, userId: string, input: unknown, deps: ReloadDeps) {
  const p = parseInput(StartWalletReloadInput, input);
  if (!p.ok) return p;

  const [{ data: pricing }, { data: canReload }, { data: profile }] = await Promise.all([
    sb.rpc("vendor_pricing", { p_vendor: userId }),
    sb.rpc("can_reload", { v: userId }),
    sb.from("profiles").select("email").eq("id", userId).maybeSingle(),
  ]);
  const price = (Array.isArray(pricing) ? pricing[0] : pricing) as Pricing | null;
  if (!price) return fail("Reloads aren't available right now.");
  if (canReload !== true) return fail(`You can reload when your balance drops below ${usd(price.reload_below_cents)}.`);
  if (p.data.steps > price.reload_max_steps)
    return fail(`The most you can add at once is ${usd(price.reload_step_cents * price.reload_max_steps)}.`);

  const base = `${deps.siteUrl}/vendor/dashboard/account`;
  const s = await deps.createSession({
    vendorId: userId,
    steps: p.data.steps,
    stepCents: price.reload_step_cents,
    email: profile?.email ?? null,
    successUrl: `${base}?reloaded=1`,
    cancelUrl: `${base}?canceled=1`,
  });
  return s.ok ? ok({ url: s.url }) : fail(s.error);
}
