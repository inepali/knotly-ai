// src/agent/vendor/responder.ts
// Runs whenever a couple's message reaches a vendor. The agent drafts a reply (with a
// computed estimate when it's a quote), holds it unsent, and emails the vendor a copy to
// review. Nothing reaches the couple until the vendor approves it in Knotly.
import "server-only";
import { supabaseAdmin as db } from "@/lib/supabase/admin";
import { sendDraftReviewEmail } from "@/lib/email";
import { loadVendorCtx } from "./context";
import { decide } from "./decide";
import { buildEstimate, formatEstimate } from "./estimate";

export async function runVendorAgent(threadId: string, opts: { appUrl?: string } = {}) {
  const ctx = await loadVendorCtx(threadId);
  if (!ctx || ctx.paused) return; // vendor took over this thread

  const decision = await decide(ctx);

  // Quotes get real numbers from the vendor's packages and rules, never from the model.
  const estimate = decision.responseType === "quote" && decision.quote ? buildEstimate(ctx, decision.quote) : null;
  const warnings = [...(estimate?.warnings ?? [])];
  if (decision.responseType === "quote" && !estimate)
    warnings.push("The assistant chose a quote but didn't pick one of your packages, so no estimate is attached.");
  if (decision.responseType === "escalate")
    warnings.push(`Needs you: ${decision.escalationReason ?? "the assistant wasn't sure how to answer"}.`);
  if (decision.confidence < (ctx.settings?.confidence_threshold ?? 0.7))
    warnings.push(`The assistant is only ${Math.round(decision.confidence * 100)}% sure about this reply.`);

  const signature = ctx.settings?.signature ? `\n\n${ctx.settings.signature}` : "";
  const body = (estimate ? `${decision.message}\n\n${formatEstimate(estimate)}` : decision.message) + signature;

  const [{ data: lastCouple }, { data: thread }] = await Promise.all([
    db
      .from("messages")
      .select("subject")
      .eq("thread_id", threadId)
      .eq("status", "sent")
      .in("sender", ["couple", "couple_agent"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("threads").select("couple_projects(partner_names)").eq("id", threadId).single(),
  ]);
  const coupleName =
    (thread?.couple_projects as unknown as { partner_names: string | null } | null)?.partner_names ?? "the couple";
  const date = ctx.wedding.wedding_date
    ? new Date(`${ctx.wedding.wedding_date}T12:00:00`).toLocaleDateString("en-US", { dateStyle: "long" })
    : null;
  const base = lastCouple?.subject ?? "Your wedding inquiry";
  const subject = estimate
    ? `Your estimate from ${ctx.vendor.business_name}${date ? ` for ${date}` : ""}`
    : /^re:/i.test(base)
      ? base
      : `Re: ${base}`;

  // One pending reply per conversation: a newer couple message replaces an unapproved draft.
  await db
    .from("messages")
    .delete()
    .eq("thread_id", threadId)
    .eq("sender", "vendor_agent")
    .eq("status", "pending_approval");

  const { error } = await db.from("messages").insert({
    thread_id: threadId,
    sender: "vendor_agent",
    status: "pending_approval", // held: only the vendor's approval sends it
    subject,
    body,
    payload: { decision, estimate, warnings },
  });
  if (error) {
    console.error("[vendor agent] draft", error.message);
    return;
  }
  await db.from("agent_audit_log").insert({
    thread_id: threadId,
    agent: "vendor_agent",
    decision,
    outcome: "draft",
  });

  // Copy to the human vendor for review.
  const { data: vp } = await db.from("profiles").select("email").eq("id", ctx.vendor.id).single();
  if (!vp?.email) return;
  const appUrl = process.env.APP_URL ?? opts.appUrl ?? "http://localhost:3000";
  const { error: mailError } = await sendDraftReviewEmail({
    to: vp.email,
    vendorName: ctx.vendor.business_name,
    coupleName,
    kind: decision.responseType,
    subject,
    body,
    warnings,
    link: `${appUrl}/inbox/${threadId}`,
  });
  if (mailError) console.error("[vendor agent] review email", mailError.message);
}
