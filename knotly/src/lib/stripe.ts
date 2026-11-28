// src/lib/stripe.ts — the two Stripe calls Knotly needs, over Stripe's REST API (no SDK).
// STRIPE_SECRET_KEY stays on the server; prices always come from our catalog, never the browser.
import "server-only";
import type { Cart } from "./addons";

const API = "https://api.stripe.com/v1";
// Stripe Tax product code for electronically supplied services.
const TAX_CODE = "txcd_10000000";

/** Stripe wants nested form fields: line_items[0][price_data][currency]=usd. */
export function toForm(obj: Record<string, unknown>, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") toForm(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export type CheckoutParams = {
  cart: Cart;
  projectId: string;
  email?: string | null;
  successUrl: string;
  cancelUrl: string;
};

export function checkoutSessionBody({ cart, projectId, email, successUrl, cancelUrl }: CheckoutParams) {
  return toForm({
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: projectId,
    customer_email: email ?? undefined,
    billing_address_collection: "required",
    automatic_tax: { enabled: true },
    metadata: { project_id: projectId, keys: cart.keys.join(",") },
    payment_intent_data: { metadata: { project_id: projectId, keys: cart.keys.join(",") } },
    line_items: Object.fromEntries(
      cart.lines.map((l, i) => [
        i,
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: l.amount_cents,
            tax_behavior: "exclusive",
            product_data: { name: `Knotly · ${l.name}`, tax_code: TAX_CODE, metadata: { addon_key: l.key } },
          },
        },
      ])
    ),
  });
}

export type SessionResult = { ok: true; url: string } | { ok: false; error: string };

/** Create a Checkout Session and return its hosted URL. */
export async function createCheckoutSession(p: CheckoutParams): Promise<SessionResult> {
  return postCheckoutSession(checkoutSessionBody(p));
}

// Vendor wallet reloads (pricing-vendor-wallet-spec.md): $20 steps, Stripe Tax on top, and the
// wallet is credited the pre-tax amount by the webhook (metadata.type = wallet_reload).
export type WalletReloadParams = {
  vendorId: string;
  steps: number; // how many $20 steps
  stepCents: number;
  email?: string | null;
  successUrl: string;
  cancelUrl: string;
};

export const WALLET_RELOAD = "wallet_reload";
export const NO_REFUND_NOTICE = "Wallet credit is non-refundable and has no cash value.";

export function walletReloadSessionBody({ vendorId, steps, stepCents, email, successUrl, cancelUrl }: WalletReloadParams) {
  const metadata = { type: WALLET_RELOAD, vendor_id: vendorId, amount_cents: steps * stepCents };
  return toForm({
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: vendorId,
    customer_email: email ?? undefined,
    billing_address_collection: "required",
    automatic_tax: { enabled: true },
    metadata,
    payment_intent_data: { metadata },
    custom_text: { submit: { message: NO_REFUND_NOTICE } },
    line_items: {
      0: {
        quantity: steps,
        price_data: {
          currency: "usd",
          unit_amount: stepCents,
          tax_behavior: "exclusive",
          product_data: { name: `Knotly wallet credit ($${stepCents / 100})`, tax_code: TAX_CODE },
        },
      },
    },
  });
}

export async function createWalletReloadSession(p: WalletReloadParams): Promise<SessionResult> {
  return postCheckoutSession(walletReloadSessionBody(p));
}

async function postCheckoutSession(body: URLSearchParams): Promise<SessionResult> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { ok: false, error: "Payments aren't set up yet." };
  const res = await fetch(`${API}/checkout/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: { message?: string } };
  if (!res.ok || !json.url) {
    console.error("stripe checkout failed", res.status, json.error?.message);
    return { ok: false, error: "We couldn't start checkout. Please try again." };
  }
  return { ok: true, url: json.url };
}
