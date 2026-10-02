// src/app/api/inquiries/[id]/send/route.ts
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendInquiryEmail } from "@/lib/email";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = await supabaseServer();

  // 1. Read through RLS: succeeds only if this couple owns the draft
  const { data: msg } = await sb
    .from("messages")
    .select(
      "id, subject, body, status, thread_id, threads(vendor_id, vendors(business_name))"
    )
    .eq("id", id)
    .single();
  if (!msg) return Response.json({ ok: false }, { status: 404 });
  if (msg.status === "sent") return Response.json({ ok: true }); // idempotent: already done

  // 2. Claim it: flip status only if still a draft (stops double-click double-sends)
  const { data: claimed } = await supabaseAdmin
    .from("messages")
    .update({ status: "sent" })
    .eq("id", id)
    .eq("status", "pending_approval")
    .select("id");
  if (!claimed?.length) return Response.json({ ok: true });

  // 3. Email the vendor
  // The couple can't read the vendor's email (RLS on profiles), so look it up as the server
  const thread = (msg as any).threads;
  const { data: vp } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", thread.vendor_id)
    .single();
  const { error } = await sendInquiryEmail({
    to: vp?.email ?? "",
    vendorName: thread.vendors.business_name,
    subject: msg.subject ?? "Wedding inquiry",
    body: msg.body,
    link: `${process.env.APP_URL}/vendor/leads/${msg.thread_id}`,
  });
  if (error) {
    // undo so they can retry
    await supabaseAdmin
      .from("messages")
      .update({ status: "pending_approval" })
      .eq("id", id);
    return Response.json({ ok: false }, { status: 502 });
  }
  return Response.json({ ok: true });
}
