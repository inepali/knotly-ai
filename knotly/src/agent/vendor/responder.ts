// src/agent/vendor/responder.ts
import "server-only";
import { supabaseAdmin as db } from "@/lib/supabase/admin";
import { loadVendorCtx } from "./context";
import { decide } from "./decide";

export async function runVendorAgent(threadId: string) {
  const ctx = await loadVendorCtx(threadId);
  if (!ctx || ctx.paused) return; // vendor took over this thread

  const decision = await decide(ctx);

  // For now: always a draft the vendor must approve (Lesson 15 adds the gate)
  await db.from("messages").insert({
    thread_id: threadId,
    sender: "vendor_agent",
    status: "pending_approval",
    body: decision.message,
    payload: { decision },
  });
  await db.from("agent_audit_log").insert({
    thread_id: threadId,
    agent: "vendor_agent",
    decision,
    outcome: "draft",
  });
}
