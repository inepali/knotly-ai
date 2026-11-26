// src/app/api/calendar/[token]/route.ts — a vendor's booked dates as an .ics feed that Google,
// Apple or Outlook calendar can subscribe to. Calendar apps can't sign in, so the long secret
// token in the link is the credential; the vendor can reset it from the Availability page.
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NO_THREAD } from "@/agent/vendor/rules";
import { buildIcs, type IcsEvent } from "@/lib/ics";

type CoupleInfo = { partner_names: string | null; venue: string | null };
type ThreadRow = { id: string; couple_projects: CoupleInfo | CoupleInfo[] | null };

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/calendar/[token]">) {
  const token = (await ctx.params).token.replace(/\.ics$/i, "");
  if (!/^[a-f0-9]{64}$/.test(token)) return new Response("Not found", { status: 404 });

  const db = supabaseAdmin;
  const { data: feed } = await db.from("vendor_calendar_feeds").select("vendor_id").eq("token", token).maybeSingle();
  if (!feed) return new Response("Not found", { status: 404 });

  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: rows } = await db
    .from("vendor_availability")
    .select("date, thread_id")
    .eq("vendor_id", feed.vendor_id)
    .eq("status", "booked")
    .gte("date", since)
    .order("date")
    .limit(1000);

  // Dates booked through a conversation get the couple's names; ones the vendor marked by hand don't.
  const threadIds = [...new Set((rows ?? []).map((r) => r.thread_id).filter((t): t is string => !!t && t !== NO_THREAD))];
  const couples = new Map<string, CoupleInfo>();
  if (threadIds.length) {
    const { data: threads } = await db.from("threads").select("id, couple_projects(partner_names, venue)").in("id", threadIds);
    for (const t of (threads ?? []) as unknown as ThreadRow[]) {
      const c = Array.isArray(t.couple_projects) ? t.couple_projects[0] : t.couple_projects;
      if (c) couples.set(t.id, c);
    }
  }

  const events: IcsEvent[] = (rows ?? []).map((r) => {
    const couple = r.thread_id ? couples.get(r.thread_id) : undefined;
    return {
      uid: `${feed.vendor_id}-${r.date}-${r.thread_id ?? "manual"}@knotly`,
      date: r.date,
      summary: couple?.partner_names ? `Booked: ${couple.partner_names}` : "Booked (Knotly)",
      description: [couple?.venue && `Venue: ${couple.venue}`, "Booked in Knotly."].filter(Boolean).join("\n"),
    };
  });

  return new Response(buildIcs("Knotly bookings", events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": 'inline; filename="knotly-bookings.ics"',
    },
  });
}
