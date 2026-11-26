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

/** Create a Checkout Session and return its hosted URL. */
export async function createCheckoutSession(p: CheckoutParams): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { ok: false, error: "Payments aren't set up yet." };
  const res = await fetch(`${API}/checkout/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: checkoutSessionBody(p),
  });
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: { message?: string } };
  if (!res.ok || !json.url) {
    console.error("stripe checkout failed", res.status, json.error?.message);
    return { ok: false, error: "We couldn't start checkout. Please try again." };
  }
  return { ok: true, url: json.url };
}
