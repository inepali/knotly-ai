// src/app/api/inquiries/[id]/send/route.ts
// Approve and send a draft. Works for both sides:
//   couple sends their (agent's) inquiry  → email the vendor, then run the vendor agent
//   vendor approves their agent's reply   → email the couple
import type { NextRequest } from "next/server";
import { after } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendInquiryEmail, sendMessageEmail } from "@/lib/email";
import { runVendorAgent } from "@/agent/vendor/responder";
import { z } from "zod";

// Optional edits made while reviewing the draft.
const Edits = z.object({
  subject: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(5000).optional(),
});

export const maxDuration = 60;

type Thread = {
  vendor_id: string;
  vendors: { business_name: string } | null;
  couple_projects: { couple_id: string; partner_names: string | null } | null;
};

export async function POST(req: NextRequest, ctx: RouteContext<"/api/inquiries/[id]/send">) {
  const { id } = await ctx.params;
  const parsed = Edits.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return Response.json({ ok: false, error: "Subject and message can't be empty." }, { status: 400 });
  const edits = parsed.data;
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return Response.json({ ok: false, error: "Please sign in." }, { status: 401 });

  // 1. Read through RLS: each side can only read its own drafts.
  const { data: msg } = await sb
    .from("messages")
    .select(
      "id, subject, body, status, sender, payload, thread_id, threads(vendor_id, vendors(business_name), couple_projects(couple_id, partner_names))"
    )
    .eq("id", id)
    .maybeSingle();
  if (!msg) return Response.json({ ok: false, error: "Not found." }, { status: 404 });
  if (msg.status === "sent") return Response.json({ ok: true }); // idempotent: already done

  const thread = msg.threads as unknown as Thread;
  const fromVendor = msg.sender === "vendor" || msg.sender === "vendor_agent";
  // Only the side that owns the draft may send it.
  const allowed = fromVendor ? thread.vendor_id === user.id : thread.couple_projects?.couple_id === user.id;
  if (!allowed) return Response.json({ ok: false, error: "Not found." }, { status: 404 });

  // 2. Claim it: flip status only if still a draft (stops double-click double-sends).
  // From here the message is in the other side's Knotly inbox and can't be un-sent.
  // The vendor agent's payload holds its internal decision and vendor-only warnings.
  // The couple can read a sent message's payload, so keep only the estimate's figures.
  const payload = msg.payload as { estimate?: { warnings?: unknown } | null } | null;
  const publicPayload = fromVendor
    ? { estimate: payload?.estimate ? { ...payload.estimate, warnings: undefined } : null }
    : payload;
  const { data: claimed } = await supabaseAdmin
    .from("messages")
    .update({ ...edits, payload: publicPayload, status: "sent", created_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending_approval")
    .select("subject, body");
  if (!claimed?.length) return Response.json({ ok: true });

  // 3. Email the other side (the sender can't read their address through RLS).
  // A failed email doesn't undo the send; emailed_at stays null.
  const recipientId = fromVendor ? thread.couple_projects?.couple_id : thread.vendor_id;
  const { data: rp } = recipientId
    ? await supabaseAdmin.from("profiles").select("email").eq("id", recipientId).single()
    : { data: null };
  const link = `${process.env.APP_URL ?? req.nextUrl.origin}/inbox/${msg.thread_id}`;
  const vendorName = thread.vendors?.business_name ?? "A vendor";

  let emailed = false;
  if (rp?.email) {
    const { error } = fromVendor
      ? await sendMessageEmail({
          to: rp.email,
          recipientName: thread.couple_projects?.partner_names ?? "there",
          intro: `${vendorName} replied on Knotly:`,
          subject: claimed[0].subject ?? `Re: your inquiry to ${vendorName}`,
          body: claimed[0].body,
          link,
        })
      : await sendInquiryEmail({
          to: rp.email,
          vendorName,
          subject: claimed[0].subject ?? "Wedding inquiry",
          body: claimed[0].body,
          link,
        });
    if (error) console.error("[inquiries/send] email", error.message);
    else {
      emailed = true;
      await supabaseAdmin.from("messages").update({ emailed_at: new Date().toISOString() }).eq("id", id);
    }
  }

  // A couple's message wakes the vendor's agent (after the couple gets their response).
  if (!fromVendor) after(() => runVendorAgent(msg.thread_id, { appUrl: req.nextUrl.origin }));
  return Response.json({ ok: true, emailed, threadId: msg.thread_id });
}
