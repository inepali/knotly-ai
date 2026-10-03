// src/app/api/escalations/[id]/resolve/route.ts
import { z } from "zod";
import { after } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin as db } from "@/lib/supabase/admin";
import { loadVendorCtx } from "@/agent/vendor/context";
import { priceQuote } from "@/agent/vendor/pricing";
import { act } from "@/agent/vendor/act";
import { runVendorAgent } from "@/agent/vendor/responder";
import type { Decision } from "@/agent/vendor/decide";

export const maxDuration = 60;

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("edit"), message: z.string().min(1).max(3000) }),
  z.object({
    action: z.literal("guide"),
    guidance: z.string().min(3).max(1000),
  }),
  z.object({ action: z.literal("reject") }),
  z.object({ action: z.literal("take_over") }),
]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = Body.parse(await req.json());

  // Read through RLS: proves this vendor owns the escalation
  const sb = await supabaseServer();
  const { data: esc } = await sb
    .from("escalations")
    .select("*")
    .eq("id", id)
    .single();
  if (!esc) return Response.json({ ok: false }, { status: 404 });

  // Claim it once (double-taps do nothing)
  const resolution = {
    approve: "approved",
    edit: "edited",
    guide: "guided",
    reject: "rejected",
    take_over: "taken_over",
  }[body.action];
  const { data: claimed } = await db
    .from("escalations")
    .update({
      status: "resolved",
      resolution,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .neq("status", "resolved")
    .select("id");
  if (!claimed?.length) return Response.json({ ok: true, already: true });

  const ctx = await loadVendorCtx(esc.thread_id);
  if (!ctx) return Response.json({ ok: false }, { status: 404 });
  const decision = esc.decision as Decision;

  switch (body.action) {
    case "approve": // the human's yes replaces the gate
      await act(decision, ctx, priceQuote(decision, ctx));
      break;
    case "edit":
      await act(decision, ctx, priceQuote(decision, ctx), body.message);
      break;
    case "guide": // "offer 6 hours at $3,600 instead" -> agent rewrites, gate checks again
      after(() => runVendorAgent(esc.thread_id, body.guidance));
      break;
    case "take_over": // agent steps back on this thread
      await db
        .from("threads")
        .update({ vendor_agent_paused: true })
        .eq("id", esc.thread_id);
      break;
    case "reject":
      break; // nothing sent
  }
  await db.from("agent_audit_log").insert({
    thread_id: esc.thread_id,
    agent: "vendor_agent",
    outcome: `human_${resolution}`,
  });
  return Response.json({ ok: true });
}
