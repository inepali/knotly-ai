import { supabaseAdmin as db } from "@/lib/supabase/admin";
import { loadVendorCtx } from "./context";
import { decide } from "./decide";
import { priceQuote } from "./pricing";
import { gate } from "./gate";
import { act, escalate } from "./act";
import { verifyCitation } from "./instructions";
import { notify } from "@/lib/email";

export async function runVendorAgent(threadId: string, guidance?: string) {
  const ctx = await loadVendorCtx(threadId);
  if (!ctx || ctx.paused) return;

  // Pay as you go and can't cover the $1 lead fee: don't process. Holding reply to the couple,
  // nudge to the vendor. (Basic/Pro always can. An RPC error lets it run: the estimate still
  // needs the fee, see act().)
  const { data: canTake } = await db.rpc("vendor_can_take_lead", { v: ctx.vendor.id });
  if (canTake === false) {
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
        "A couple sent you an inquiry. Reload your balance so your agent can reply.",
        `${process.env.APP_URL}/vendor/dashboard/account`
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

  const raw = await decide(ctx, guidance);
  // Only an exact excerpt of the vendor's notes is kept; it's shown to the vendor, never the couple.
  const decision = {
    ...raw,
    citedInstruction: verifyCitation(raw.citedInstruction, ctx.settings.agent_custom_instructions),
  };
  const priced = priceQuote(decision, ctx);
  const result = gate(decision, ctx, priced);

  let outcome = result.pass ? "sent" : "escalated";
  if (result.pass) {
    // The balance can drop between the check above and the estimate (another lead, a text):
    // then the vendor approves it after reloading.
    if ((await act(decision, ctx, priced)) === "insufficient_balance") {
      await escalate(decision, ctx, priced, ["insufficient_balance"]);
      outcome = "escalated";
    }
  } else await escalate(decision, ctx, priced, result.violations);

  await db.from("agent_audit_log").insert({
    thread_id: threadId,
    agent: "vendor_agent",
    decision,
    gate: result,
    outcome,
  });
}
