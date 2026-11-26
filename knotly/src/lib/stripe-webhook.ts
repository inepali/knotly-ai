// src/lib/stripe-webhook.ts — what Knotly does with each (already verified) Stripe event.
// Kept apart from the route so it can be tested with a stand-in database client.
import type { SupabaseClient } from "@supabase/supabase-js";

type StripeEvent = { id: string; type: string; data: { object: Record<string, unknown> } };
export type WebhookOutcome = "duplicate" | "granted" | "revoked" | "ignored" | "error";

export async function handleStripeEvent(db: SupabaseClient, event: StripeEvent): Promise<WebhookOutcome> {
  // De-dupe: Stripe may deliver the same event more than once.
  const { error: seen } = await db.from("stripe_events").insert({ id: event.id, type: event.type });
  if (seen) return seen.code === "23505" || /duplicate/i.test(seen.message) ? "duplicate" : "error";

  const o = event.data.object;
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    if (o.payment_status !== "paid") return "ignored"; // async methods finish in a later event
    const meta = (o.metadata ?? {}) as Record<string, string>;
    const keys = (meta.keys ?? "").split(",").filter(Boolean);
    const project = meta.project_id || (o.client_reference_id as string | undefined);
    if (!project || !keys.length) return "ignored";
    const tax = (o.total_details as { amount_tax?: number } | undefined)?.amount_tax ?? 0;
    const { error } = await db.rpc("grant_addons", {
      p_project: project,
      p_keys: keys,
      p_session: o.id as string,
      p_intent: (o.payment_intent as string | null) ?? null,
      p_amount: (o.amount_total as number | undefined) ?? 0,
      p_tax: tax,
    });
    return error ? "error" : "granted";
  }

  if (event.type === "charge.refunded") {
    const intent = o.payment_intent as string | undefined;
    if (!intent) return "ignored";
    // Partial refunds keep access; only a full refund takes the add-ons back.
    if (o.amount_refunded !== o.amount) return "ignored";
    const { error } = await db.rpc("revoke_addons_for_payment", { p_intent: intent });
    return error ? "error" : "revoked";
  }

  return "ignored";
}
