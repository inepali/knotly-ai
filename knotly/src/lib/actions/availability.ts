// src/lib/actions/availability.ts — a vendor's calendar (shared by chat tools and forms).
import { z } from "zod";
import { NO_THREAD } from "@/agent/vendor/rules";
import { ok, parseInput, type Sb } from "./result";

export const SetAvailabilityInput = z.object({
  dates: z.array(z.string().describe("YYYY-MM-DD")).min(1).max(60),
  status: z.enum(["blocked", "booked", "free"]),
});
export type SetAvailabilityInput = z.input<typeof SetAvailabilityInput>;

export async function setAvailability(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(SetAvailabilityInput, input);
  if (!p.ok) return p;
  const { dates, status } = p.data;

  // Database errors are not checked here, same as the chat tool always behaved.
  if (status === "free") {
    await sb
      .from("vendor_availability")
      .delete()
      .eq("vendor_id", userId)
      .in("date", dates)
      .eq("thread_id", NO_THREAD);
  } else {
    await sb.from("vendor_availability").upsert(
      dates.map((date) => ({ vendor_id: userId, date, status, thread_id: NO_THREAD }))
    );
  }
  return ok({ dates, status });
}
