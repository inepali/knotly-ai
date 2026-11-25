// src/lib/actions/vendor-profile.ts — the business profile, packages, add-ons, testimonials
// and publishing (shared by chat tools and forms).
import { z } from "zod";
import { after } from "next/server";
import { Category, resolveMetro } from "@/agent/shared";
import { refreshVendorEmbedding } from "@/lib/embeddings";
import { fail, ok, parseInput, type ActionCtx, type Sb } from "./result";

export const SaveBusinessProfileInput = z.object({
  businessName: z.string().optional(),
  category: Category.optional(),
  bio: z.string().max(1500).optional().describe("2-4 sentences in the vendor's voice"),
  metro: z.string().optional(),
  website: z.string().url().optional(),
});
export type SaveBusinessProfileInput = z.input<typeof SaveBusinessProfileInput>;

export const SavePackagesInput = z.object({
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
});
export type SavePackagesInput = z.input<typeof SavePackagesInput>;

export const SaveAddOnsInput = z.object({
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
});
export type SaveAddOnsInput = z.input<typeof SaveAddOnsInput>;

export const AddTestimonialsInput = z.object({
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
});
export type AddTestimonialsInput = z.input<typeof AddTestimonialsInput>;

export const PublishProfileInput = z.object({ publish: z.boolean() });
export type PublishProfileInput = z.input<typeof PublishProfileInput>;

/** The vendor's own row with packages, or null. */
export async function getVendor(sb: Sb, userId: string) {
  const { data } = await sb
    .from("vendors")
    .select(
      "id, business_name, category, bio, metro_slug, price_min, published, vendor_packages(id, name, price), testimonials(id)"
    )
    .eq("id", userId)
    .maybeSingle();
  return data;
}

// Re-embed after the response finishes, so saves stay fast
const reembed = (userId: string) => after(() => refreshVendorEmbedding(userId));

async function syncPrices(sb: Sb, userId: string) {
  const { data } = await sb.from("vendor_packages").select("price").eq("vendor_id", userId);
  if (!data?.length) return;
  const p = data.map((x) => x.price);
  await sb
    .from("vendors")
    .update({ price_min: Math.min(...p), price_max: Math.max(...p) })
    .eq("id", userId);
}

export async function getMyBusiness(sb: Sb, userId: string) {
  return ok((await getVendor(sb, userId)) ?? { empty: true });
}

export async function saveBusinessProfile(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(SaveBusinessProfileInput, input);
  if (!p.ok) return p;
  const i = p.data;

  const existing = await getVendor(sb, userId);
  if (!existing && (!i.businessName || !i.category)) {
    return fail("Need the business name and category first.");
  }
  let place = {};
  if (i.metro) {
    const m = await resolveMetro(sb, i.metro);
    if (!m) return fail(`We're not in ${i.metro} yet.`);
    place = { metro_slug: m.slug, location: `SRID=4326;POINT(${m.lng} ${m.lat})` };
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
  if (error) return fail(error.message);
  reembed(userId);
  return ok({ profile: await getVendor(sb, userId) });
}

export async function savePackages(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(SavePackagesInput, input);
  if (!p.ok) return p;
  const { packages } = p.data;

  if (!(await getVendor(sb, userId))) return fail("Create the business profile first.");
  const { data, error } = await sb
    .from("vendor_packages")
    .insert(packages.map((x) => ({ ...x, vendor_id: userId })))
    .select("id, name, price");
  if (error) return fail(error.message);
  await syncPrices(sb, userId);
  reembed(userId);
  return ok({ saved: data });
}

export async function saveAddOns(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(SaveAddOnsInput, input);
  if (!p.ok) return p;
  const { addOns } = p.data;

  if (!(await getVendor(sb, userId))) return fail("Create the business profile first.");
  const { data, error } = await sb
    .from("vendor_addons")
    .insert(addOns.map((a) => ({ ...a, vendor_id: userId })))
    .select("id, name, price");
  if (error) return fail(error.message);
  reembed(userId);
  return ok({ saved: data });
}

export async function addTestimonials(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(AddTestimonialsInput, input);
  if (!p.ok) return p;
  const { reviews } = p.data;

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
  if (error) return fail(error.message);
  reembed(userId);
  return ok({ saved: data, note: "Shown as unverified until the client confirms." });
}

export async function publishProfile(sb: Sb, userId: string, input: unknown, ctx: ActionCtx = {}) {
  const p = parseInput(PublishProfileInput, input);
  if (!p.ok) return p;
  const { publish } = p.data;

  const v = await getVendor(sb, userId);
  if (!v) return fail("No profile yet.");
  // A listing couples can contact must belong to a real, verified account.
  if (publish && ctx.isGuest)
    return fail('Create a vendor account first: call requestSignUp with role "vendor".');
  if (publish && !v.vendor_packages.length) return fail("Add at least one package first.");
  await sb.from("vendors").update({ published: publish }).eq("id", userId);
  return ok({ published: publish });
}

// --- Editing what's already saved (forms; the chat tools only ever add) ---------------------

const Id = z.uuid("That item doesn't exist.");

export const UpdatePackageInput = z.object({
  id: Id,
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(800).nullable().optional(),
  price: z.number().int().positive().optional(),
  inclusions: z.array(z.string().max(120)).max(20).optional(),
});
export type UpdatePackageInput = z.input<typeof UpdatePackageInput>;

export const UpdateAddOnInput = z.object({
  id: Id,
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(400).nullable().optional(),
  price: z.number().int().min(0).optional(),
});
export type UpdateAddOnInput = z.input<typeof UpdateAddOnInput>;

export const DeleteItemInput = z.object({ id: Id });
export type DeleteItemInput = z.input<typeof DeleteItemInput>;

const withoutId = ({ id: _id, ...rest }: { id: string } & Record<string, unknown>) =>
  Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));

export async function updatePackage(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(UpdatePackageInput, input);
  if (!p.ok) return p;
  const patch = withoutId(p.data);
  if (!Object.keys(patch).length) return fail("Nothing to change.");
  const { data, error } = await sb
    .from("vendor_packages")
    .update(patch)
    .eq("id", p.data.id)
    .eq("vendor_id", userId)
    .select("id, name, price");
  if (error) return fail(error.message);
  if (!data?.length) return fail("Package not found.");
  await syncPrices(sb, userId);
  reembed(userId);
  return ok({ saved: data[0] });
}

export async function deletePackage(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(DeleteItemInput, input);
  if (!p.ok) return p;
  // A live listing needs at least one package (publishProfile enforces the same on the way in).
  const v = await getVendor(sb, userId);
  if (v?.published && v.vendor_packages.length <= 1)
    return fail("Unpublish your listing before deleting your only package.");
  const { data, error } = await sb
    .from("vendor_packages")
    .delete()
    .eq("id", p.data.id)
    .eq("vendor_id", userId)
    .select("id");
  if (error) return fail(error.message);
  if (!data?.length) return fail("Package not found.");
  await syncPrices(sb, userId);
  reembed(userId);
  return ok({ deleted: p.data.id });
}

export async function updateAddOn(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(UpdateAddOnInput, input);
  if (!p.ok) return p;
  const patch = withoutId(p.data);
  if (!Object.keys(patch).length) return fail("Nothing to change.");
  const { data, error } = await sb
    .from("vendor_addons")
    .update(patch)
    .eq("id", p.data.id)
    .eq("vendor_id", userId)
    .select("id, name, price");
  if (error) return fail(error.message);
  if (!data?.length) return fail("Add-on not found.");
  reembed(userId);
  return ok({ saved: data[0] });
}

export async function deleteAddOn(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(DeleteItemInput, input);
  if (!p.ok) return p;
  const { data, error } = await sb
    .from("vendor_addons")
    .delete()
    .eq("id", p.data.id)
    .eq("vendor_id", userId)
    .select("id");
  if (error) return fail(error.message);
  if (!data?.length) return fail("Add-on not found.");
  reembed(userId);
  return ok({ deleted: p.data.id });
}

export async function deleteTestimonial(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(DeleteItemInput, input);
  if (!p.ok) return p;
  const { data, error } = await sb
    .from("testimonials")
    .delete()
    .eq("id", p.data.id)
    .eq("vendor_id", userId)
    .select("id");
  if (error) return fail(error.message);
  if (!data?.length) return fail("Review not found.");
  reembed(userId);
  return ok({ deleted: p.data.id });
}
