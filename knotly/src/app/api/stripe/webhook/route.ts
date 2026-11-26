// src/app/api/stripe/webhook/route.ts — Stripe → Knotly. Signature is checked before anything else.
// Point a Stripe webhook at /api/stripe/webhook with: checkout.session.completed,
// checkout.session.async_payment_succeeded, charge.refunded. Secret goes in STRIPE_WEBHOOK_SECRET.
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyStripeSignature } from "@/lib/stripe-signature";
import { handleStripeEvent } from "@/lib/stripe-webhook";

export async function POST(req: Request) {
  const payload = await req.text(); // raw body: the signature covers the exact bytes
  if (!verifyStripeSignature(payload, req.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET ?? "")) {
    return new Response("Bad signature", { status: 400 });
  }
  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response("Bad payload", { status: 400 });
  }
  const outcome = await handleStripeEvent(supabaseAdmin, event);
  // A 500 makes Stripe retry; the event id was recorded, so roll it back first.
  if (outcome === "error") {
    await supabaseAdmin.from("stripe_events").delete().eq("id", event.id);
    return new Response("Error", { status: 500 });
  }
  return Response.json({ received: true, outcome });
}
