// Availability: a calendar for dates you can't take, calendar sync, and the weekly windows
// couples can book a call in.
import { headers } from "next/headers";
import { requireVendor } from "@/lib/vendor-session";
import { NO_THREAD } from "@/agent/vendor/rules";
import { ensureFeedToken } from "@/lib/actions/calendar-feed";
import AvailabilityEditor from "@/components/dashboard/AvailabilityEditor";

async function appOrigin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${h.get("x-forwarded-proto") ?? "http"}://${host}`;
}

export default async function AvailabilityPage() {
  const { sb, userId } = await requireVendor();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: dates }, { data: hours }, { data: settings }, token, origin] = await Promise.all([
    sb
      .from("vendor_availability")
      .select("date, status, thread_id, hold_expires_at")
      .eq("vendor_id", userId)
      .gte("date", today)
      .order("date")
      .limit(500),
    sb.from("consult_hours").select("weekday, start_time, end_time, timezone, slot_minutes").eq("vendor_id", userId).order("weekday"),
    sb.from("vendor_agent_settings").select("call_link, call_min_notice_hours, calls_per_day").eq("vendor_id", userId).maybeSingle(),
    ensureFeedToken(sb, userId),
    appOrigin(),
  ]);

  const rows = dates ?? [];
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
          .map((r) => ({ date: r.date, status: r.status as "blocked" | "booked" }))}
        holds={rows
          .filter((r) => r.thread_id !== NO_THREAD && r.status === "held")
          .map((r) => ({ date: r.date, expires: r.hold_expires_at }))}
        coupleBooked={rows.filter((r) => r.thread_id !== NO_THREAD && r.status === "booked").map((r) => r.date)}
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
