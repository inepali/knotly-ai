// src/agent/tools/couple.ts
import { tool } from "ai";
import { z } from "zod";
import { Category, resolveMetro, type ToolCtx } from "../shared";
import { embedText } from "@/lib/embeddings";

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
    searchVendors: tool({
      description:
        "Search published vendors by meaning plus filters. Uses the saved wedding city and style by default.",
      inputSchema: z.object({
        category: Category,
        query: z.string().describe("What the couple wants, in their words"),
        maxPrice: z
          .number()
          .int()
          .optional()
          .describe("Max starting price in USD"),
        radiusMiles: z.number().int().min(5).max(200).default(50),
      }),
      execute: async ({ category, query, maxPrice, radiusMiles }) => {
        const wedding = await getProject();
        const metro = await resolveMetro(
          sb,
          wedding?.metro_slug ?? "charlotte-nc"
        );

        // Short queries embed poorly; blend in what we know
        const text = [
          `${category} for a wedding`,
          query,
          wedding?.style && `Style: ${wedding.style}`,
        ]
          .filter(Boolean)
          .join(". ");

        const { data, error } = await sb.rpc("match_vendors", {
          query_embedding: await embedText(text),
          p_category: category,
          p_lat: metro?.lat ?? null,
          p_lng: metro?.lng ?? null,
          p_radius_miles: radiusMiles,
          p_max_price: maxPrice ?? null,
          p_limit: 6,
        });
        if (error) return { ok: false, error: error.message };

        return {
          // small, clean objects: the model reads every token
          ok: true,
          category,
          city: metro?.name,
          vendors: (data ?? []).map((v: any) => ({
            id: v.id,
            name: v.business_name,
            priceFrom: v.price_min,
            rating: v.avg_rating,
            reviews: Number(v.review_count),
            miles:
              v.distance_miles != null ? Math.round(v.distance_miles) : null,
            match: Math.round(v.similarity * 100),
            blurb: v.bio,
          })),
        };
      },
    }),

    getVendorDetails: tool({
      description: "Get one vendor's packages and reviews.",
      inputSchema: z.object({ vendorId: z.string().uuid() }),
      execute: async ({ vendorId }) => {
        const { data, error } = await sb
          .from("vendors")
          .select(
            "id, business_name, category, bio, price_min, vendor_packages(name, price, inclusions), testimonials(author_name, rating, body, verified)"
          )
          .eq("id", vendorId)
          .single();
        return error
          ? { ok: false, error: error.message }
          : { ok: true, vendor: data };
      },
    }),

    getMyWedding: tool({
      description:
        "Get the couple's saved wedding details. Call before searching or drafting messages.",
      inputSchema: z.object({}),
      execute: async () => (await getProject()) ?? { empty: true },
    }),

    requestSignUp: tool({
      description:
        "Show the create-account card (email or phone + password) to a GUEST. Call after a few messages, or before contacting vendors.",
      inputSchema: z.object({
        reason: z.string().describe("One short sentence shown on the card"),
      }),
      execute: async ({ reason }) =>
        isGuest ? { show: "signup", reason } : { alreadySignedIn: true },
    }),

    requestSignIn: tool({
      description:
        "Show the sign-in card to a GUEST who already has an account (they say so, or this browser signed in before).",
      inputSchema: z.object({
        reason: z.string().describe("One short sentence shown on the card"),
      }),
      execute: async ({ reason }) =>
        isGuest ? { show: "signin", reason } : { alreadySignedIn: true },
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
