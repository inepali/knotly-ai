import { supabaseAdmin as db } from "@/lib/supabase/admin";
import { loadVendorCtx } from "./context";
import { decide } from "./decide";
import { priceQuote } from "./pricing";
import { gate } from "./gate";
import { act, escalate } from "./act";
import { notify } from "@/lib/email";

export async function runVendorAgent(threadId: string, guidance?: string) {
  const ctx = await loadVendorCtx(threadId);
  if (!ctx || ctx.paused) return;

  // No credits: don't process. Holding reply to the couple, nudge to the vendor.
  const { data: balance } = await db.rpc("vendor_credit_balance", {
    v: ctx.vendor.id,
  });
  if ((balance ?? 0) <= 0) {
    const { data: t } = await db
      .from("threads")
      .select("status")
      .eq("id", threadId)
      .single();
    if (t?.status !== "waiting_credits") {
      await db
        .from("threads")
        .update({ status: "waiting_credits" })
        .eq("id", threadId);
      await db
        .from("messages")
        .insert({
          thread_id: threadId,
          sender: "system",
          status: "sent",
          body: ctx.settings.holding_reply,
        });
      const { data: p } = await db
        .from("profiles")
        .select("email")
        .eq("id", ctx.vendor.id)
        .single();
      await notify(
        p?.email ?? "",
        "A new inquiry is waiting for you",
        "A couple sent you an inquiry. Add credits so your agent can reply.",
        `${process.env.APP_URL}/vendor`
      );
    }
    await db
      .from("agent_audit_log")
      .insert({
        thread_id: threadId,
        agent: "vendor_agent",
        outcome: "waiting_credits",
      });
    return;
  }

  const decision = await decide(ctx, guidance);
  const priced = priceQuote(decision, ctx);
  const result = gate(decision, ctx, priced);

  if (result.pass) await act(decision, ctx, priced);
  else await escalate(decision, ctx, priced, result.violations);

  await db.from("agent_audit_log").insert({
    thread_id: threadId,
    agent: "vendor_agent",
    decision,
    gate: result,
    outcome: result.pass ? "sent" : "escalated",
  });
}
