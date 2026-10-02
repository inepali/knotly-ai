// src/app/api/inquiries/[id]/send/route.ts
import type { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendInquiryEmail } from "@/lib/email";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/inquiries/[id]/send">) {
  const { id } = await ctx.params;
  const sb = await supabaseServer();

  // 1. Read through RLS: succeeds only if this couple owns the draft
  const { data: msg } = await sb
    .from("messages")
    .select("id, subject, body, status, thread_id, threads(vendor_id, vendors(business_name))")
    .eq("id", id)
    .maybeSingle();
  if (!msg) return Response.json({ ok: false, error: "Not found." }, { status: 404 });
  if (msg.status === "sent") return Response.json({ ok: true }); // idempotent: already done

  // 2. Claim it: flip status only if still a draft (stops double-click double-sends).
  // From here the message is in the vendor's Knotly inbox and can't be un-sent.
  const { data: claimed } = await supabaseAdmin
    .from("messages")
    .update({ status: "sent", created_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending_approval")
    .select("id");
  if (!claimed?.length) return Response.json({ ok: true });

  // 3. Email the vendor. The couple can't read the vendor's email (RLS on profiles),
  // so look it up as the server. A failed email doesn't undo the send; emailed_at stays null.
  const thread = msg.threads as unknown as { vendor_id: string; vendors: { business_name: string } };
  const { data: vp } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", thread.vendor_id)
    .single();
  let emailed = false;
  if (vp?.email) {
    const { error } = await sendInquiryEmail({
      to: vp.email,
      vendorName: thread.vendors.business_name,
      subject: msg.subject ?? "Wedding inquiry",
      body: msg.body,
      link: `${process.env.APP_URL ?? req.nextUrl.origin}/inbox/${msg.thread_id}`,
    });
    if (error) console.error("[inquiries/send] email", error.message);
    else {
      emailed = true;
      await supabaseAdmin.from("messages").update({ emailed_at: new Date().toISOString() }).eq("id", id);
    }
  }
  return Response.json({ ok: true, emailed, threadId: msg.thread_id });
}
