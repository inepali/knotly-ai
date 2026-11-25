// src/lib/actions/inquiries.ts — finding vendors and drafting inquiries to them
// (shared by chat tools and forms).
import { z } from "zod";
import { Category, resolveMetro } from "@/agent/shared";
import { embedText } from "@/lib/embeddings";
import { getProject } from "./wedding";
import { fail, ok, parseInput, type ActionCtx, type Fail, type Sb } from "./result";

export const DraftInquiryInput = z.object({
  drafts: z
    .array(
      // Loose schema on purpose: a failed schema check never reaches the chat tool's execute
      // and shows nothing in the chat, so the action validates and returns a readable error.
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
});
export type DraftInquiryInput = z.input<typeof DraftInquiryInput>;

export const SearchVendorsInput = z.object({
  category: Category,
  query: z.string().describe("What the couple wants, in their words"),
  maxPrice: z.number().int().optional().describe("Max starting price in USD"),
  radiusMiles: z.number().int().min(5).max(200).default(50),
});
export type SearchVendorsInput = z.input<typeof SearchVendorsInput>;

export const GetVendorDetailsInput = z.object({ vendorId: z.string().uuid() });
export type GetVendorDetailsInput = z.input<typeof GetVendorDetailsInput>;

type SavedDraft = { id: string; subject: string | null; body: string | null; vendorName: string };
type FailedDraft = { vendorId: string; error: string };

export async function draftInquiry(
  sb: Sb,
  userId: string,
  input: unknown,
  ctx: ActionCtx = {}
): Promise<
  | { ok: true; data: { drafts: SavedDraft[]; failed: FailedDraft[]; note: string } }
  | Fail<{ failed?: FailedDraft[] }>
> {
  const p = parseInput(DraftInquiryInput, input);
  if (!p.ok) return p;
  const { drafts } = p.data;

  if (ctx.isGuest) return fail("Guests can't contact vendors. Call requestSignUp (or requestSignIn).");
  const wedding = await getProject(sb, userId);
  if (!wedding) return fail("Save wedding details first.");

  const saved: SavedDraft[] = [];
  const failed: FailedDraft[] = [];
  for (const d of drafts) {
    if (!z.uuid().safeParse(d.vendorId).success) {
      failed.push({ vendorId: d.vendorId, error: "Not a vendor id. Use the id from searchVendors." });
      continue;
    }
    const subject = d.subject.trim().slice(0, 100);
    const body = d.body.trim().slice(0, 1500);
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
        subject,
        body,
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
    if (error) return fail(error.message);
    const vendors = (thread as unknown as { vendors: { business_name: string } }).vendors;
    saved.push({ ...msg, vendorName: vendors.business_name });
  }
  if (!saved.length) return { ok: false, error: "No drafts were saved.", failed };
  return ok({
    drafts: saved,
    failed,
    note: "Only the drafts listed here were saved; the couple sees them as cards and taps Send. Mention any failed ones.",
  });
}

type VendorMatch = {
  id: string;
  business_name: string;
  price_min: number | null;
  avg_rating: number | null;
  review_count: number | string;
  distance_miles: number | null;
  similarity: number;
  bio: string | null;
};

export async function searchVendors(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(SearchVendorsInput, input);
  if (!p.ok) return p;
  const { category, query, maxPrice, radiusMiles } = p.data;

  const wedding = await getProject(sb, userId);
  const metro = await resolveMetro(sb, wedding?.metro_slug ?? "charlotte-nc");

  // Short queries embed poorly; blend in what we know
  const text = [`${category} for a wedding`, query, wedding?.style && `Style: ${wedding.style}`]
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
  if (error) return fail(error.message);

  return ok({
    // small, clean objects: the model reads every token
    category,
    city: metro?.name,
    vendors: ((data ?? []) as VendorMatch[]).map((v) => ({
      id: v.id,
      name: v.business_name,
      priceFrom: v.price_min,
      rating: v.avg_rating,
      reviews: Number(v.review_count),
      miles: v.distance_miles != null ? Math.round(v.distance_miles) : null,
      match: Math.round(v.similarity * 100),
      blurb: v.bio,
    })),
  });
}

export async function getVendorDetails(sb: Sb, _userId: string, input: unknown) {
  const p = parseInput(GetVendorDetailsInput, input);
  if (!p.ok) return p;

  const { data, error } = await sb
    .from("vendors")
    .select(
      "id, business_name, category, bio, price_min, vendor_packages(id, name, description, price, inclusions), vendor_addons(id, name, description, price), testimonials(author_name, rating, body, verified)"
    )
    .eq("id", p.data.vendorId)
    .single();
  return error ? fail(error.message) : ok({ vendor: data });
}
