// src/agent/tools/vendor.ts
import { tool } from "ai";
import { z } from "zod";
import { after } from "next/server";
import { Category, resolveMetro, type ToolCtx } from "../shared";
import { refreshVendorEmbedding } from "@/lib/embeddings";
import { RuleSchema, NO_THREAD, Rule } from "../vendor/rules";
import { accountTools } from "./account";
import { ingestKnowledge, kindOfUrl, parsePublicUrl } from "@/lib/knowledge";
import { PDF_UPLOADS_ENABLED } from "@/lib/flags";

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

export function vendorTools({ sb, userId, isGuest }: ToolCtx) {
  // Re-embed after the reply finishes, so the chat stays fast
  const reembed = () => after(() => refreshVendorEmbedding(userId));

  async function getVendor() {
    const { data } = await sb
      .from("vendors")
      .select(
        "id, business_name, category, bio, metro_slug, price_min, published, vendor_packages(id, name, price), testimonials(id)"
      )
      .eq("id", userId)
      .maybeSingle();
    return data;
  }

  async function syncPrices() {
    const { data } = await sb
      .from("vendor_packages")
      .select("price")
      .eq("vendor_id", userId);
    if (!data?.length) return;
    const p = data.map((x) => x.price);
    await sb
      .from("vendors")
      .update({ price_min: Math.min(...p), price_max: Math.max(...p) })
      .eq("id", userId);
  }

  return {
    ...accountTools({ sb, userId, isGuest }, "vendor"),

    addKnowledge: tool({
      description: `Add to the vendor's knowledge base, which their assistant uses to answer couples: a link (website, Instagram, Facebook, YouTube) or an FAQ.${
        PDF_UPLOADS_ENABLED
          ? " For PDFs, tell them to upload in the Knowledge tab."
          : " PDFs aren't supported yet."
      }`,
      inputSchema: z.object({
        url: z.string().optional().describe("A link to learn from"),
        question: z
          .string()
          .optional()
          .describe("FAQ question, in the couple's words"),
        answer: z
          .string()
          .optional()
          .describe("FAQ answer, exactly as the vendor gives it"),
      }),
      execute: async ({ url, question, answer }) => {
        if (!(await getVendor()))
          return { ok: false, error: "Create the business profile first." };
        let row;
        if (url) {
          const u = parsePublicUrl(url);
          if (!u)
            return { ok: false, error: "That isn't a public web address." };
          row = { kind: kindOfUrl(u), url: u.toString(), title: u.hostname };
        } else if (question && answer) {
          row = { kind: "faq", question, answer, title: question };
        } else
          return {
            ok: false,
            error: "Give a link, or both a question and an answer.",
          };

        const { data, error } = await sb
          .from("vendor_knowledge")
          .insert({ ...row, vendor_id: userId, status: "pending" })
          .select("id, kind")
          .single();
        if (error) return { ok: false, error: error.message };
        after(() => ingestKnowledge(data.id)); // reading a page takes a few seconds
        return {
          ok: true,
          added: data.kind,
          note: "Being learned now; it shows as Ready in the Knowledge tab.",
        };
      },
    }),

    saveRule: tool({
      description:
        "Save ONE business rule for the vendor's AI agent. First restate the rule in plain words and get a clear yes. " +
        "Call once per rule.",
      inputSchema: z.object({
        rule: RuleSchema,
        sourceText: z.string().describe("The vendor's own words for this rule"),
      }),
      execute: async ({ rule, sourceText }) => {
        const { kind, ...params } = rule;
        // One active rule per kind (except blackout / always_review, which can repeat)
        if (!["blackout_weekday", "always_review"].includes(kind)) {
          await sb
            .from("vendor_agent_rules")
            .update({ active: false })
            .eq("vendor_id", userId)
            .eq("kind", kind);
        }
        const { data, error } = await sb
          .from("vendor_agent_rules")
          .insert({ vendor_id: userId, kind, params, source_text: sourceText })
          .select("id, kind, params")
          .single();
        return error
          ? { ok: false, error: error.message }
          : { ok: true, saved: data };
      },
    }),

    listRules: tool({
      description: "List the vendor's active agent rules and settings.",
      inputSchema: z.object({}),
      execute: async () => {
        const [{ data: rules }, { data: settings }] = await Promise.all([
          sb
            .from("vendor_agent_rules")
            .select("id, kind, params, source_text")
            .eq("vendor_id", userId)
            .eq("active", true),
          sb
            .from("vendor_agent_settings")
            .select("*")
            .eq("vendor_id", userId)
            .single(),
        ]);
        return { rules, settings };
      },
    }),

    setAvailability: tool({
      description: "Block dates, mark them booked, or free them up.",
      inputSchema: z.object({
        dates: z.array(z.string().describe("YYYY-MM-DD")).min(1).max(60),
        status: z.enum(["blocked", "booked", "free"]),
      }),
      execute: async ({ dates, status }) => {
        if (status === "free") {
          await sb
            .from("vendor_availability")
            .delete()
            .eq("vendor_id", userId)
            .in("date", dates)
            .eq("thread_id", NO_THREAD);
        } else {
          await sb.from("vendor_availability").upsert(
            dates.map((date) => ({
              vendor_id: userId,
              date,
              status,
              thread_id: NO_THREAD,
            }))
          );
        }
        return { ok: true, dates, status };
      },
    }),

    setAutonomy: tool({
      description:
        "Change how independently the agent works. 0 Shadow (drafts only), 1 Assist (answers alone, estimates need approval), 2 Autopilot (everything within rules), 3 Full (adds discounts within limit).",
      inputSchema: z.object({ level: z.number().int().min(0).max(3) }),
      execute: async ({ level }) => {
        const { error } = await sb
          .from("vendor_agent_settings")
          .update({ autonomy_level: level })
          .eq("vendor_id", userId);
        return error
          ? { ok: false, error: error.message }
          : { ok: true, level };
      },
    }),

    getMyBusiness: tool({
      description:
        "Get the vendor's current profile, packages and review count.",
      inputSchema: z.object({}),
      execute: async () => (await getVendor()) ?? { empty: true },
    }),

    saveBusinessProfile: tool({
      description:
        "Create or update the business profile. Call as soon as you learn any field.",
      inputSchema: z.object({
        businessName: z.string().optional(),
        category: Category.optional(),
        bio: z
          .string()
          .max(1500)
          .optional()
          .describe("2-4 sentences in the vendor's voice"),
        metro: z.string().optional(),
        website: z.string().url().optional(),
      }),
      execute: async (i) => {
        const existing = await getVendor();
        if (!existing && (!i.businessName || !i.category)) {
          return {
            ok: false,
            error: "Need the business name and category first.",
          };
        }
        let place = {};
        if (i.metro) {
          const m = await resolveMetro(sb, i.metro);
          if (!m) return { ok: false, error: `We're not in ${i.metro} yet.` };
          place = {
            metro_slug: m.slug,
            location: `SRID=4326;POINT(${m.lng} ${m.lat})`,
          };
        }
        const patch = Object.fromEntries(
          Object.entries({
            business_name: i.businessName,
            category: i.category,
            bio: i.bio,
            website: i.website,
            ...place,
          }).filter(([, v]) => v !== undefined)
        );

        const { error } = existing
          ? await sb.from("vendors").update(patch).eq("id", userId)
          : await sb.from("vendors").insert({ id: userId, ...patch });
        if (error) return { ok: false, error: error.message };
        reembed();
        return { ok: true, profile: await getVendor() };
      },
    }),

    getAgentStats: tool({
      description:
        "How the vendor's AI agent performed in the last 30 days, and whether it has earned more autonomy.",
      inputSchema: z.object({}),
      execute: async () => {
        const [{ data: s }, { data: st }] = await Promise.all([
          sb
            .from("vendor_agent_stats")
            .select("*")
            .eq("vendor_id", userId)
            .maybeSingle(),
          sb
            .from("vendor_agent_settings")
            .select("autonomy_level")
            .eq("vendor_id", userId)
            .single(),
        ]);
        const approved = s?.approved_as_is ?? 0,
          changed = s?.changed_by_human ?? 0;
        const approvalRate =
          approved + changed ? approved / (approved + changed) : null;
        return {
          ...s,
          level: st?.autonomy_level,
          approvalRate,
          suggestion:
            approved >= 20 &&
            (approvalRate ?? 0) >= 0.9 &&
            (st?.autonomy_level ?? 0) < 2
              ? "You approved 90%+ of drafts unchanged. Consider Autopilot (level 2)."
              : null,
        };
      },
    }),

    savePackages: tool({
      description:
        "Save service packages. Extract them from pasted text or an attached price sheet. Whole USD.",
      inputSchema: z.object({
        packages: z
          .array(
            z.object({
              name: z.string().max(80),
              description: z.string().max(800).optional(),
              price: z.number().int().positive(),
              inclusions: z.array(z.string().max(120)).max(20).default([]),
            })
          )
          .min(1)
          .max(10),
      }),
      execute: async ({ packages }) => {
        if (!(await getVendor()))
          return { ok: false, error: "Create the business profile first." };
        const { data, error } = await sb
          .from("vendor_packages")
          .insert(packages.map((p) => ({ ...p, vendor_id: userId })))
          .select("id, name, price");
        if (error) return { ok: false, error: error.message };
        await syncPrices();
        reembed();
        return { ok: true, saved: data };
      },
    }),

    saveAddOns: tool({
      description:
        "Save optional add-ons sold on top of a package (second shooter, extra hour, album…). Whole USD. Only add-ons the vendor states.",
      inputSchema: z.object({
        addOns: z
          .array(
            z.object({
              name: z.string().max(80),
              description: z.string().max(400).optional(),
              price: z.number().int().min(0),
            })
          )
          .min(1)
          .max(20),
      }),
      execute: async ({ addOns }) => {
        if (!(await getVendor()))
          return { ok: false, error: "Create the business profile first." };
        const { data, error } = await sb
          .from("vendor_addons")
          .insert(addOns.map((a) => ({ ...a, vendor_id: userId })))
          .select("id, name, price");
        if (error) return { ok: false, error: error.message };
        reembed();
        return { ok: true, saved: data };
      },
    }),

    addTestimonials: tool({
      description:
        "Save client reviews from pasted text or attached screenshots/PDFs. Copy the words exactly; skip anything that is not a real client review.",
      inputSchema: z.object({
        reviews: z
          .array(
            z.object({
              authorName: z.string(),
              rating: z.number().int().min(1).max(5).optional(),
              body: z.string().min(20).max(2000),
            })
          )
          .min(1)
          .max(20),
      }),
      execute: async ({ reviews }) => {
        const { data, error } = await sb
          .from("testimonials")
          .insert(
            reviews.map((r) => ({
              vendor_id: userId,
              author_name: r.authorName,
              rating: r.rating ?? null,
              body: r.body,
              verified: false,
            }))
          )
          .select("id, author_name");
        if (error) return { ok: false, error: error.message };
        reembed();
        return {
          ok: true,
          saved: data,
          note: "Shown as unverified until the client confirms.",
        };
      },
    }),

    publishProfile: tool({
      description:
        "Make the business visible in search. Only when the vendor clearly asks to go live.",
      inputSchema: z.object({ publish: z.boolean() }),
      execute: async ({ publish }) => {
        const v = await getVendor();
        if (!v) return { ok: false, error: "No profile yet." };
        // A listing couples can contact must belong to a real, verified account.
        if (publish && isGuest)
          return {
            ok: false,
            error:
              'Create a vendor account first: call requestSignUp with role "vendor".',
          };
        if (publish && !v.vendor_packages.length)
          return { ok: false, error: "Add at least one package first." };
        await sb
          .from("vendors")
          .update({ published: publish })
          .eq("id", userId);
        return { ok: true, published: publish };
      },
    }),
  };
}
