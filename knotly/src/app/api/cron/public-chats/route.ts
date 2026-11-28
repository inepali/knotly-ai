// src/app/api/cron/public-chats/route.ts — nightly: delete public-page chats nobody claimed and
// that never became a lead, 30 days after their last message (vendor-public-agent-chat-spec.md).
// Scheduled in vercel.json; Vercel Cron sends Authorization: Bearer $CRON_SECRET.
import { supabaseAdmin as db } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { data, error } = await db.rpc("purge_stale_vendor_chats");
  if (error) {
    console.error("[cron/public-chats]", error.message);
    return new Response(error.message, { status: 500 });
  }
  return Response.json({ deleted: typeof data === "number" ? data : 0 });
}
