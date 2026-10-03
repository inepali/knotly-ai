// src/app/api/cron/escalations/route.ts
import { supabaseAdmin as db } from "@/lib/supabase/admin";
import { notify } from "@/lib/email";

export async function GET(req: Request) {
  if (
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }
  const now = new Date().toISOString();
  const { data: overdue } = await db
    .from("escalations")
    .select("id, thread_id, vendor_id, status, created_at")
    .in("status", ["open", "reminded"])
    .lt("due_at", now);

  for (const e of overdue ?? []) {
    const { data: vp } = await db
      .from("profiles")
      .select("email")
      .eq("id", e.vendor_id)
      .single();
    if (e.status === "open") {
      // 2h: remind the vendor
      await db
        .from("escalations")
        .update({
          status: "reminded",
          due_at: new Date(
            new Date(e.created_at).getTime() + 24 * 3_600_000
          ).toISOString(),
        })
        .eq("id", e.id);
      await notify(
        vp?.email ?? "",
        "Reminder: a couple is waiting",
        "Your agent needs your decision on an inquiry.",
        `${process.env.APP_URL}/vendor/inbox`
      );
    } else {
      // 24h: be honest with the couple
      await db.from("escalations").update({ status: "expired" }).eq("id", e.id);
      const { data: s } = await db
        .from("vendor_agent_settings")
        .select("holding_reply")
        .eq("vendor_id", e.vendor_id)
        .single();
      await db
        .from("messages")
        .insert({
          thread_id: e.thread_id,
          sender: "system",
          status: "sent",
          body: s!.holding_reply,
        });
    }
  }
  return Response.json({ checked: overdue?.length ?? 0 });
}
