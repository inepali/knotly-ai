// src/agent/vendor/rules.ts
import { z } from "zod";

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
