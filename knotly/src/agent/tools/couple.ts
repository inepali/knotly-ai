// src/agent/tools/couple.ts
import { tool } from "ai";
import { z } from "zod";
import { Category, resolveMetro, type ToolCtx } from "../shared";

export function coupleTools({ sb, userId, isGuest }: ToolCtx) {
  async function getProject() {
    const { data } = await sb
      .from("couple_projects")
      .select("*")
      .eq("couple_id", userId)
      .limit(1)
      .maybeSingle();
    return data;
  }

  return {
    getMyWedding: tool({
      description:
        "Get the couple's saved wedding details. Call before searching or drafting messages.",
      inputSchema: z.object({}),
      execute: async () => (await getProject()) ?? { empty: true },
    }),

    requestVerification: tool({
      description:
        "Show the email verification card. Call when a GUEST wants to contact vendors.",
      inputSchema: z.object({
        reason: z.string().describe("Short reason shown on the card"),
      }),
      execute: async ({ reason }) =>
        isGuest ? { show: "verification", reason } : { alreadyVerified: true },
    }),

    saveWeddingDetails: tool({
      description:
        "Save wedding details. Call as soon as you learn ANY field; leave out unknown fields.",
      inputSchema: z.object({
        partnerNames: z.string().optional().describe('e.g. "Priya & Sam"'),
        weddingDate: z
          .string()
          .optional()
          .describe("YYYY-MM-DD; use the 1st if only the month is known"),
        metro: z.string().optional().describe('City, e.g. "Charlotte"'),
        venue: z
          .string()
          .optional()
          .describe(
            'Venue name once booked or chosen, e.g. "Crystal Ballroom"'
          ),
        guestCount: z.number().int().positive().optional(),
        budgetTotal: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Total budget in USD"),
        style: z
          .string()
          .optional()
          .describe('Their words, e.g. "boho, outdoor"'),
        needs: z
          .array(Category)
          .optional()
          .describe("Vendor types still needed"),
      }),
      execute: async (input) => {
        let metro_slug: string | undefined;
        if (input.metro) {
          const m = await resolveMetro(sb, input.metro);
          if (!m)
            return {
              ok: false,
              error: `We're not in ${input.metro} yet. Try Charlotte, Raleigh, or Greenville SC.`,
            };
          metro_slug = m.slug;
        }
        // Keep only the fields the model actually sent
        const patch = Object.fromEntries(
          Object.entries({
            partner_names: input.partnerNames,
            wedding_date: input.weddingDate,
            metro_slug,
            venue: input.venue,
            guest_count: input.guestCount,
            budget_total: input.budgetTotal,
            style: input.style,
            needs: input.needs,
          }).filter(([, v]) => v !== undefined)
        );

        const existing = await getProject();
        const { data, error } = existing
          ? await sb
              .from("couple_projects")
              .update(patch)
              .eq("id", existing.id)
              .select()
              .single()
          : await sb
              .from("couple_projects")
              .insert({ couple_id: userId, ...patch })
              .select()
              .single();
        if (error) return { ok: false, error: error.message };

        const missing = [
          "partner_names",
          "wedding_date",
          "metro_slug",
          "guest_count",
          "budget_total",
          "style",
          "needs",
        ].filter(
          (k) => !data[k] || (Array.isArray(data[k]) && data[k].length === 0)
        );
        return { ok: true, wedding: data, missing };
      },
    }),
  };
}
