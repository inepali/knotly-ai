// src/lib/actions/availability.ts — a vendor's calendar and consultation hours
// (shared by chat tools and forms).
import { z } from "zod";
import { NO_THREAD } from "@/agent/vendor/rules";
import { fail, ok, parseInput, type Sb } from "./result";

export const SetAvailabilityInput = z.object({
  dates: z.array(z.string().describe("YYYY-MM-DD")).min(1).max(60),
  status: z.enum(["blocked", "booked", "free"]),
});
export type SetAvailabilityInput = z.input<typeof SetAvailabilityInput>;

const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:00)?$/, "Use a time like 09:00.");

export const SaveConsultHoursInput = z.object({
  hours: z
    .array(
      z
        .object({
          weekday: z.number().int().min(0).max(6),
          startTime: Time,
          endTime: Time,
          timezone: z.string().min(1).max(60).default("America/New_York"),
          slotMinutes: z.number().int().min(15).max(120).default(30),
        })
        .refine((h) => h.endTime.slice(0, 5) > h.startTime.slice(0, 5), {
          message: "A call window must end after it starts.",
        })
    )
    .max(28),
  callLink: z.string().max(500).nullable().optional(),
  callMinNoticeHours: z.number().int().min(0).max(720).optional(),
  callsPerDay: z.number().int().min(1).max(20).optional(),
});
export type SaveConsultHoursInput = z.input<typeof SaveConsultHoursInput>;

export async function setAvailability(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(SetAvailabilityInput, input);
  if (!p.ok) return p;
  const { dates, status } = p.data;

  const { error } =
    status === "free"
      ? await sb
          .from("vendor_availability")
          .delete()
          .eq("vendor_id", userId)
          .in("date", dates)
          .eq("thread_id", NO_THREAD)
      : await sb
          .from("vendor_availability")
          .upsert(dates.map((date) => ({ vendor_id: userId, date, status, thread_id: NO_THREAD })));
  if (error) return fail(error.message);
  return ok({ dates, status });
}

/** Replace the weekly call windows, and update the call settings if sent. */
export async function saveConsultHours(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(SaveConsultHoursInput, input);
  if (!p.ok) return p;
  const { hours, callLink, callMinNoticeHours, callsPerDay } = p.data;

  const settings = Object.fromEntries(
    Object.entries({
      call_link: callLink === undefined ? undefined : callLink?.trim() || null,
      call_min_notice_hours: callMinNoticeHours,
      calls_per_day: callsPerDay,
    }).filter(([, v]) => v !== undefined)
  );
  if (Object.keys(settings).length) {
    const { error } = await sb.from("vendor_agent_settings").update(settings).eq("vendor_id", userId);
    if (error) return fail(error.message);
  }

  const { error: clearError } = await sb.from("consult_hours").delete().eq("vendor_id", userId);
  if (clearError) return fail(clearError.message);
  if (hours.length) {
    const { error } = await sb.from("consult_hours").insert(
      hours.map((h) => ({
        vendor_id: userId,
        weekday: h.weekday,
        start_time: h.startTime,
        end_time: h.endTime,
        timezone: h.timezone,
        slot_minutes: h.slotMinutes,
      }))
    );
    if (error) return fail(error.message);
  }
  return ok({ hours: hours.length });
}
