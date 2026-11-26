// Availability: a calendar for dates you can't take, calendar sync, and the weekly windows
// couples can book a call in.
import { headers } from "next/headers";
import { requireVendor } from "@/lib/vendor-session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NO_THREAD } from "@/agent/vendor/rules";
import { ensureFeedToken } from "@/lib/actions/calendar-feed";
import AvailabilityEditor from "@/components/dashboard/AvailabilityEditor";

async function appOrigin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${h.get("x-forwarded-proto") ?? "http"}://${host}`;
}

type DateRow = { date: string; status: string; thread_id: string | null; hold_expires_at: string | null; title?: string | null; details?: string | null };

// Titles and details need the newest migration; without it, still show the dates.
async function loadDates(sb: Awaited<ReturnType<typeof requireVendor>>["sb"], userId: string, today: string): Promise<DateRow[]> {
  const query = (cols: string) =>
    sb.from("vendor_availability").select(cols).eq("vendor_id", userId).gte("date", today).order("date").limit(500);
  const full = await query("date, status, thread_id, hold_expires_at, title, details");
  if (!full.error) return (full.data ?? []) as unknown as DateRow[];
  const basic = await query("date, status, thread_id, hold_expires_at");
  return (basic.data ?? []) as unknown as DateRow[];
}

export default async function AvailabilityPage() {
  const { sb, userId } = await requireVendor();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: dates }, { data: hours }, { data: settings }, token, origin] = await Promise.all([
    loadDates(sb, userId, today),
    sb.from("consult_hours").select("weekday, start_time, end_time, timezone, slot_minutes").eq("vendor_id", userId).order("weekday"),
    sb.from("vendor_agent_settings").select("call_link, call_min_notice_hours, calls_per_day").eq("vendor_id", userId).maybeSingle(),
    ensureFeedToken(sb, userId),
    appOrigin(),
  ]);

  const rows = dates;

  // Names for dates booked through a conversation.
  const bookedThreads = [...new Set(rows.filter((r) => r.thread_id !== NO_THREAD && r.status === "booked").map((r) => r.thread_id as string))];
  const names = new Map<string, string>();
  if (bookedThreads.length) {
    const { data: threads } = await supabaseAdmin
      .from("threads")
      .select("id, couple_projects(partner_names)")
      .eq("vendor_id", userId)
      .in("id", bookedThreads);
    for (const t of (threads ?? []) as unknown as { id: string; couple_projects: { partner_names: string | null } | { partner_names: string | null }[] | null }[]) {
      const c = Array.isArray(t.couple_projects) ? t.couple_projects[0] : t.couple_projects;
      if (c?.partner_names) names.set(t.id, c.partner_names);
    }
  }
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Availability</h1>
      <p className="mt-1 text-sm text-gray-600">
        Click a day to block it or mark it booked. Your agent won&apos;t offer dates you&apos;ve blocked or booked, and dates
        it is holding for a couple show up too. Past days can&apos;t be changed.
      </p>
      <AvailabilityEditor
        serverToday={today}
        manual={rows
          .filter((r) => r.thread_id === NO_THREAD && (r.status === "blocked" || r.status === "booked"))
          .map((r) => ({ date: r.date, status: r.status as "blocked" | "booked", title: r.title ?? null, details: r.details ?? null }))}
        holds={rows
          .filter((r) => r.thread_id !== NO_THREAD && r.status === "held")
          .map((r) => ({ date: r.date, expires: r.hold_expires_at }))}
        coupleBooked={rows
          .filter((r) => r.thread_id !== NO_THREAD && r.status === "booked")
          .map((r) => ({ date: r.date, label: names.get(r.thread_id as string) ?? null }))}
        feedUrl={token ? `${origin}/api/calendar/${token}.ics` : null}
        hours={(hours ?? []).map((h) => ({
          weekday: h.weekday,
          startTime: h.start_time.slice(0, 5),
          endTime: h.end_time.slice(0, 5),
          timezone: h.timezone,
          slotMinutes: h.slot_minutes,
        }))}
        callLink={settings?.call_link ?? ""}
        minNotice={settings?.call_min_notice_hours ?? 24}
        callsPerDay={settings?.calls_per_day ?? 4}
      />
    </div>
  );
}
