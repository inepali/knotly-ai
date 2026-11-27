// src/app/api/cron/photo-retention/route.ts — delete guest photos a year (+30 days) after the wedding.
// Schedule it daily (e.g. Vercel Cron) with Authorization: Bearer $CRON_SECRET.
import { supabaseAdmin as db } from "@/lib/supabase/admin";
import { removeObjects } from "@/lib/storage";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { data, error } = await db.rpc("expired_guest_photos", { p_limit: 500 });
  if (error) return new Response(error.message, { status: 500 });
  const rows = (data ?? []) as { id: string; path: string }[];
  if (rows.length) {
    await removeObjects("guest-photos", rows.map((r) => r.path));
    await db.from("guest_photos").delete().in("id", rows.map((r) => r.id));
  }
  return Response.json({ deleted: rows.length });
}
