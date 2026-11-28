// src/app/api/cron/wallet-holds/route.ts — nightly: give back the $1 held on estimates that can no
// longer be opened (declined, past their valid-until date, or unopened for 30 days).
// Scheduled in vercel.json; Vercel Cron sends Authorization: Bearer $CRON_SECRET.
import { supabaseAdmin as db } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { data, error } = await db.rpc("release_stale_holds");
  if (error) {
    console.error("[cron/wallet-holds]", error.message);
    return new Response(error.message, { status: 500 });
  }
  return Response.json({ released: typeof data === "number" ? data : 0 });
}
