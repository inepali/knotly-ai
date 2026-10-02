// src/agent/vendor/rules.ts
import { z } from "zod";

export type Booking = {
  date: string;
  status: "held" | "booked" | "blocked";
  hold_expires_at: string | null;
};

// Is the vendor free on this date, given their calendar and rules?
export function dateStatus(
  date: string | null,
  bookings: Booking[],
  rules: Rule[]
): "open" | "full" | "blocked" | "unknown" {
  if (!date) return "unknown";
  const d = new Date(date + "T12:00:00");
  const blackout = rules.some(
    (r) =>
      r.kind === "blackout_weekday" &&
      r.weekday === d.getDay() &&
      (!r.months || r.months.includes(d.getMonth() + 1))
  );
  const onDate = bookings.filter(
    (b) =>
      b.date === date &&
      !(
        b.status === "held" &&
        b.hold_expires_at &&
        new Date(b.hold_expires_at) < new Date()
      )
  );
  if (blackout || onDate.some((b) => b.status === "blocked")) return "blocked";
  const cap = rules.find((r) => r.kind === "capacity_per_day");
  const max = cap?.kind === "capacity_per_day" ? cap.max : 1;
  return onDate.length >= max ? "full" : "open";
}

export function milesBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) {
  const R = 3959,
    toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat),
    dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const RuleSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("price_floor"),
    amount: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("max_discount"),
    percent: z.number().min(0).max(50),
  }),
  z.object({
    kind: z.literal("capacity_per_day"),
    max: z.number().int().min(1).max(5),
  }),
  z.object({
    kind: z.literal("blackout_weekday"),
    weekday: z.number().int().min(0).max(6).describe("0 = Sunday"),
    months: z
      .array(z.number().int().min(1).max(12))
      .optional()
      .describe("Only these months; omit for all"),
  }),
  z.object({
    kind: z.literal("service_radius"),
    miles: z.number().int().min(5).max(500),
  }),
  z.object({
    kind: z.literal("always_review"),
    field: z.enum(["guest_count", "days_until_wedding", "budget_for_category"]),
    op: z.enum([">", "<"]),
    value: z.number(),
  }),
]);
export type Rule = z.infer<typeof RuleSchema>;

export const NO_THREAD = "00000000-0000-0000-0000-000000000000"; // for blocked dates
