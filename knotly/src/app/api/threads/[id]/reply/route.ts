// src/app/api/threads/[id]/reply/route.ts
// Reply in a conversation, as the couple or the vendor. Replies are sent immediately
// (only the agent's messages go through drafts) and the other side gets an email.
import type { NextRequest } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendMessageEmail } from "@/lib/email";
import { fail } from "@/lib/auth";
import { runVendorAgent } from "@/agent/vendor/responder";

export const maxDuration = 60;

const Body = z.object({ body: z.string().trim().min(1, "Write a message first.").max(5000) });

type ThreadRow = {
  id: string;
  vendor_id: string;
  vendors: { business_name: string } | null;
  couple_projects: { couple_id: string; partner_names: string | null } | null;
};

export async function POST(req: NextRequest, ctx: RouteContext<"/api/threads/[id]/reply">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return fail("Not found.", 404);
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || user.is_anonymous) return fail("Please sign in.", 401);

  // RLS: only the couple who owns the thread or the vendor in it can read it.
  const { data } = await sb
    .from("threads")
    .select("id, vendor_id, vendors(business_name), couple_projects(couple_id, partner_names)")
    .eq("id", id)
    .maybeSingle();
  const thread = data as unknown as ThreadRow | null;
  if (!thread) return fail("Not found.", 404);

  const side = thread.vendor_id === user.id ? "vendor" : thread.couple_projects?.couple_id === user.id ? "couple" : null;
  if (!side) return fail("Not found.", 404);

  const { data: last } = await supabaseAdmin
    .from("messages")
    .select("subject")
    .eq("thread_id", id)
    .eq("status", "sent")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const base = last?.subject ?? "Your wedding inquiry";
  const subject = /^re:/i.test(base) ? base : `Re: ${base}`;

  // The database only lets couples write drafts and vendors nothing, so the server writes it.
  const { data: msg, error } = await supabaseAdmin
    .from("messages")
    .insert({ thread_id: id, sender: side, status: "sent", subject, body: parsed.data.body })
    .select("id")
    .single();
  if (error) return fail(error.message, 500);

  // Replying means they've read the conversation.
  await sb.rpc("mark_thread_read", { p_thread: id });

  // Email the other side.
  const recipientId = side === "vendor" ? thread.couple_projects?.couple_id : thread.vendor_id;
  const { data: rp } = recipientId
    ? await supabaseAdmin.from("profiles").select("email").eq("id", recipientId).single()
    : { data: null };
  let emailed = false;
  if (rp?.email) {
    const { error: mailError } = await sendMessageEmail({
      to: rp.email,
      recipientName: side === "vendor" ? (thread.couple_projects?.partner_names ?? "there") : (thread.vendors?.business_name ?? "there"),
      intro:
        side === "vendor"
          ? `${thread.vendors?.business_name ?? "A vendor"} replied on Knotly:`
          : "The couple replied on Knotly:",
      subject,
      body: parsed.data.body,
      link: `${process.env.APP_URL ?? req.nextUrl.origin}/inbox/${id}`,
    });
    if (mailError) console.error("[threads/reply] email", mailError.message);
    else {
      emailed = true;
      await supabaseAdmin.from("messages").update({ emailed_at: new Date().toISOString() }).eq("id", msg.id);
    }
  }

  // A couple's reply wakes the vendor's agent to draft the next response for review.
  if (side === "couple") after(() => runVendorAgent(id, { appUrl: req.nextUrl.origin }));

  return Response.json({ ok: true, emailed });
}
