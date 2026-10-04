// src/agent/tools/couple.ts
import { tool } from "ai";
import { z } from "zod";
import { Category, resolveMetro, type ToolCtx } from "../shared";
import { embedText } from "@/lib/embeddings";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { accountTools } from "./account";
import { searchKnowledge } from "@/lib/knowledge";
import { loadBudget } from "@/lib/budget";

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
    draftInquiry: tool({
      description:
        "Draft inquiry messages to 1-5 vendors. Saves DRAFTS only. The couple must tap Send on each card.",
      inputSchema: z.object({
        drafts: z
          .array(
            // Loose schema on purpose: a failed schema check never reaches execute and
            // shows nothing in the chat, so we validate below and return a readable error.
            z.object({
              vendorId: z.string().describe("The vendor's id from searchVendors results"),
              subject: z.string().describe("Under 100 characters"),
              body: z
                .string()
                .describe(
                  "Under 1500 characters. Warm and specific: date, city, guests, style, what they want from THIS vendor"
                ),
            })
          )
          .min(1)
          .max(5),
      }),
      execute: async ({ drafts }) => {
        if (isGuest)
          return {
            ok: false,
            error: "Guests can't contact vendors. Call requestSignUp (or requestSignIn).",
          };
        const wedding = await getProject();
        if (!wedding)
          return { ok: false, error: "Save wedding details first." };

        const saved = [];
        const failed: { vendorId: string; error: string }[] = [];
        for (const d of drafts) {
          if (!z.uuid().safeParse(d.vendorId).success) {
            failed.push({ vendorId: d.vendorId, error: "Not a vendor id. Use the id from searchVendors." });
            continue;
          }
          d.subject = d.subject.trim().slice(0, 100);
          d.body = d.body.trim().slice(0, 1500);
          // Reuse the thread with this vendor, or start one
          let { data: thread } = await sb
            .from("threads")
            .select("id, vendors(business_name)")
            .eq("project_id", wedding.id)
            .eq("vendor_id", d.vendorId)
            .maybeSingle();
          if (!thread) {
            const created = await sb
              .from("threads")
              .insert({ project_id: wedding.id, vendor_id: d.vendorId })
              .select("id, vendors(business_name)")
              .single();
            thread = created.data;
            if (!thread) {
              failed.push({ vendorId: d.vendorId, error: created.error?.message ?? "Couldn't start a thread." });
              continue;
            }
          }
          const { data: msg, error } = await sb
            .from("messages")
            .insert({
              thread_id: thread.id,
              sender: "couple_agent",
              status: "pending_approval",
              subject: d.subject,
              body: d.body,
              payload: {
                // facts, so the vendor's agent needn't parse prose
                type: "inquiry",
                weddingDate: wedding.wedding_date,
                metro: wedding.metro_slug,
                guestCount: wedding.guest_count,
                style: wedding.style,
              },
            })
            .select("id, subject, body")
            .single();
          if (error) return { ok: false, error: error.message };
          saved.push({
            ...msg,
            vendorName: (thread as any).vendors.business_name,
          });
        }
        if (!saved.length)
          return { ok: false, error: "No drafts were saved.", failed };
        return {
          ok: true,
          drafts: saved,
          failed,
          note: "Only the drafts listed here were saved; the couple sees them as cards and taps Send. Mention any failed ones.",
        };
      },
    }),

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

    askVendorKnowledge: tool({
      description:
        "Look up a vendor's own information (their website, FAQs, brochures) to answer a couple's question about that vendor: policies, travel, deliverables, process, contact.",
      inputSchema: z.object({
        vendorId: z.string().describe("The vendor's id from searchVendors"),
        question: z.string().describe("The couple's question, in their words"),
      }),
      execute: async ({ vendorId, question }) => {
        if (!z.uuid().safeParse(vendorId).success) return { ok: false, error: "Use the vendor's id from searchVendors." };
        // Only listings couples can see (RLS hides unpublished vendors from them).
        const { data: v } = await sb.from("vendors").select("business_name").eq("id", vendorId).maybeSingle();
        if (!v) return { ok: false, error: "Vendor not found." };
        const hits = await searchKnowledge(vendorId, question, 5);
        return hits.length
          ? {
              ok: true,
              vendor: v.business_name,
              excerpts: hits.map((h) => ({ from: h.title ?? h.kind, url: h.url, text: h.text })),
              note: "Answer only from these excerpts and say they come from the vendor. If they don't answer it, suggest asking the vendor.",
            }
          : { ok: true, vendor: v.business_name, excerpts: [], note: "The vendor hasn't shared information on this. Suggest asking them directly." };
      },
    }),

    getVendorDetails: tool({
      description: "Get one vendor's packages and reviews.",
      inputSchema: z.object({ vendorId: z.string().uuid() }),
      execute: async ({ vendorId }) => {
        const { data, error } = await sb
          .from("vendors")
          .select(
            "id, business_name, category, bio, price_min, vendor_packages(id, name, description, price, inclusions), vendor_addons(id, name, description, price), testimonials(author_name, rating, body, verified)"
          )
          .eq("id", vendorId)
          .single();
        return error
          ? { ok: false, error: error.message }
          : { ok: true, vendor: data };
      },
    }),

    getBudget: tool({
      description:
        "The couple's budget: total, each category's planned target, vendor quotes received and bookings, and what's left.",
      inputSchema: z.object({}),
      execute: async () => (await loadBudget(sb, userId)) ?? { empty: true, note: "Save wedding details first." },
    }),

    planBudget: tool({
      description:
        "Set target amounts per category (whole USD). Use to suggest an allocation from the total budget, guest count and city, or when the couple names a target. Keeps the couple's own targets unless they ask to change them.",
      inputSchema: z.object({
        allocations: z
          .array(
            z.object({
              category: z.union([Category, z.literal("other")]),
              label: z.string().optional().describe('Only for "other", e.g. "Rings"'),
              amount: z.number().int().min(0),
            })
          )
          .min(1)
          .max(20),
        fromCouple: z.boolean().describe("true if the couple stated these amounts; false if you're suggesting them"),
      }),
      execute: async ({ allocations, fromCouple }) => {
        const wedding = await getProject();
        if (!wedding) return { ok: false, error: "Save wedding details first." };
        const { data: existing } = await sb
          .from("budget_items")
          .select("category, label, planned_by")
          .eq("project_id", wedding.id);
        const skipped: string[] = [];
        const rows = allocations
          .filter((a) => {
            const own = existing?.find(
              (e) => e.category === a.category && (e.label ?? null) === (a.label ?? null) && e.planned_by === "couple"
            );
            if (own && !fromCouple) skipped.push(a.label ?? a.category); // never overwrite the couple's own target
            return !(own && !fromCouple);
          })
          .map((a) => ({
            project_id: wedding.id,
            category: a.category,
            label: a.label ?? null,
            planned: a.amount,
            planned_by: fromCouple ? "couple" : "ai",
            updated_at: new Date().toISOString(),
          }));
        if (rows.length) {
          const { error } = await sb
            .from("budget_items")
            .upsert(rows, { onConflict: "project_id,category,label" });
          if (error) return { ok: false, error: error.message };
        }
        return { ok: true, budget: await loadBudget(sb, userId), keptCoupleTargets: skipped };
      },
    }),

    recordBooking: tool({
      description: "Record that the couple booked a vendor or item, and for how much (whole USD).",
      inputSchema: z.object({
        category: z.union([Category, z.literal("other")]),
        label: z.string().optional().describe('Only for "other", e.g. "Rings"'),
        amount: z.number().int().min(0),
        vendorId: z.string().optional().describe("The vendor's id, if booked through Knotly"),
        note: z.string().max(200).optional().describe('e.g. "Golden Hour Co., Signature package"'),
      }),
      execute: async ({ category, label, amount, vendorId, note }) => {
        const wedding = await getProject();
        if (!wedding) return { ok: false, error: "Save wedding details first." };
        const { error } = await sb.from("budget_items").upsert(
          {
            project_id: wedding.id,
            category,
            label: label ?? null,
            booked: amount,
            booked_vendor_id: vendorId && z.uuid().safeParse(vendorId).success ? vendorId : null,
            booked_note: note ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "project_id,category,label" }
        );
        if (error) return { ok: false, error: error.message };
        return { ok: true, budget: await loadBudget(sb, userId) };
      },
    }),

    getMyWedding: tool({
      description:
        "Get the couple's saved wedding details. Call before searching or drafting messages.",
      inputSchema: z.object({}),
      execute: async () => (await getProject()) ?? { empty: true },
    }),

    // Guest says they run a wedding business: hand the chat to the vendor agent.
    switchToVendor: tool({
      description:
        "Hand a GUEST who runs a wedding business (and wants to be listed) to vendor onboarding. Their next message is answered by the vendor assistant.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!isGuest)
          return {
            ok: false,
            error:
              "This account is a couple account. A vendor listing needs its own vendor account: sign out, then create one and choose 'Wedding vendor'.",
          };
        // role isn't user-editable (column grants), so the server sets it.
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({ role: "vendor" })
          .eq("id", userId)
          .eq("role", "couple");
        return error ? { ok: false, error: error.message } : { ok: true, switched: "vendor" };
      },
    }),

    ...accountTools({ sb, userId, isGuest }, "couple"),

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
