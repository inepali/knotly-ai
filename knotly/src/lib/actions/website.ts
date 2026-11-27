// src/lib/actions/website.ts — the couple's Wedding Website (add-on): content, address, theme,
// photos, password and publishing. RLS also requires the active add-on for every write.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { removeObjects, uploadProblem, uploadTicket, verifyUpload } from "@/lib/storage";
import {
  MAX_SITE_PHOTOS,
  THEMES,
  isOwnSitePath,
  normalizeSections,
  slugError,
  suggestSlug,
  type Section,
  type SitePhoto,
} from "@/lib/wedding-site";
import { hashSitePassword } from "@/lib/site-password";
import { getProject } from "./wedding";
import { fail, ok, parseInput, type Sb } from "./result";

const text = (max: number) => z.string().trim().max(max);
const url = z
  .string()
  .trim()
  .max(300)
  .refine((v) => !v || /^https?:\/\//i.test(v), "Links must start with https://")
  .default("");

const SectionInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hero"), enabled: z.boolean(), subtitle: text(120).default("") }),
  z.object({ type: z.literal("story"), enabled: z.boolean(), text: text(4000).default("") }),
  z.object({ type: z.literal("schedule"), enabled: z.boolean() }),
  z.object({
    type: z.literal("travel"),
    enabled: z.boolean(),
    items: z.array(z.object({ title: text(80).min(1, "Each travel item needs a title."), details: text(600).default(""), url })).max(10),
  }),
  z.object({
    type: z.literal("party"),
    enabled: z.boolean(),
    members: z.array(z.object({ name: text(60).min(1, "Each person needs a name."), role: text(60).default("") })).max(30),
  }),
  z.object({
    type: z.literal("faq"),
    enabled: z.boolean(),
    items: z.array(z.object({ q: text(200).min(1, "Each question needs text."), a: text(1000).default("") })).max(20),
  }),
  z.object({ type: z.literal("gallery"), enabled: z.boolean() }),
  z.object({ type: z.literal("rsvp"), enabled: z.boolean() }),
  z.object({ type: z.literal("registry"), enabled: z.boolean() }),
  z.object({ type: z.literal("photos"), enabled: z.boolean() }),
]);

export const SaveSiteInput = z.object({
  slug: z.string().trim().toLowerCase(),
  theme: z.enum(Object.keys(THEMES) as [keyof typeof THEMES, ...(keyof typeof THEMES)[]]),
  title: text(80).default(""),
  sections: z.array(SectionInput).max(20),
  indexable: z.boolean().default(false),
});
export type SaveSiteInput = z.input<typeof SaveSiteInput>;

export const SetSitePasswordInput = z.object({
  password: z.string().max(100).nullable(),
});
export type SetSitePasswordInput = z.input<typeof SetSitePasswordInput>;

export const PublishSiteInput = z.object({ published: z.boolean() });
export type PublishSiteInput = z.input<typeof PublishSiteInput>;

export const SitePhotoInput = z.object({
  path: z.string().max(200),
  width: z.number().int().min(1).max(10000),
  height: z.number().int().min(1).max(10000),
});
export type SitePhotoInput = z.input<typeof SitePhotoInput>;
export const SitePhotoRef = z.object({ path: z.string().max(200), to: z.number().int().min(0).max(MAX_SITE_PHOTOS).optional() });
export type SitePhotoRef = z.input<typeof SitePhotoRef>;

type SiteRow = {
  project_id: string;
  slug: string;
  theme: keyof typeof THEMES;
  title: string | null;
  sections: unknown;
  photos: SitePhoto[];
  password_hash: string | null;
  indexable: boolean;
  published_at: string | null;
};

async function context(sb: Sb, userId: string) {
  const project = await getProject(sb, userId);
  if (!project) return { error: "Save your wedding details on My Wedding first." } as const;
  const { data: active } = await sb.rpc("has_addon", { p_project: project.id, p_key: "website" });
  const { data: site } = await sb.from("wedding_sites").select("*").eq("project_id", project.id).maybeSingle();
  return { project, active: !!active, site: (site as SiteRow | null) ?? null } as const;
}
const LOCKED = "Unlock the Wedding Website add-on to edit your site.";

/** Everything the editor needs. A wedding with no site yet gets sensible defaults (not saved). */
export async function loadSiteEditor(sb: Sb, userId: string) {
  const c = await context(sb, userId);
  if ("error" in c) return fail(c.error!);
  const { project, site, active } = c;
  const year = project.wedding_date ? Number(String(project.wedding_date).slice(0, 4)) : null;
  const { data: events } = await sb
    .from("wedding_events")
    .select("id, name, starts_at, venue")
    .eq("project_id", project.id)
    .order("sort");
  const { data: owned } = await sb.from("couple_addons").select("addon_key, active_until").eq("project_id", project.id);
  return ok({
    active,
    projectId: project.id as string,
    partnerNames: (project.partner_names as string | null) ?? null,
    weddingDate: (project.wedding_date as string | null) ?? null,
    events: events ?? [],
    owned: (owned ?? []).filter((o) => new Date(o.active_until).getTime() > Date.now()).map((o) => o.addon_key as string),
    site: {
      exists: !!site,
      slug: site?.slug ?? suggestSlug(project.partner_names as string | null, year),
      theme: site?.theme ?? "classic",
      title: site?.title ?? "",
      sections: normalizeSections(site?.sections, project.love_story as string | null),
      photos: site?.photos ?? [],
      hasPassword: !!site?.password_hash,
      indexable: site?.indexable ?? false,
      publishedAt: site?.published_at ?? null,
    },
  });
}

export async function checkSlug(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(z.object({ slug: z.string().trim().toLowerCase() }), input);
  if (!p.ok) return p;
  const err = slugError(p.data.slug);
  if (err) return fail(err);
  const project = await getProject(sb, userId);
  if (!project) return fail("Save your wedding details on My Wedding first.");
  const { data } = await sb.rpc("site_slug_available", { p_slug: p.data.slug, p_project: project.id });
  return data ? ok({ slug: p.data.slug }) : fail("That address is taken. Try adding your wedding year.");
}

export async function saveSite(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(SaveSiteInput, input);
  if (!p.ok) return p;
  const err = slugError(p.data.slug);
  if (err) return fail(err);
  const c = await context(sb, userId);
  if ("error" in c) return fail(c.error!);
  if (!c.active) return fail(LOCKED);

  const sections = normalizeSections(p.data.sections as Section[]);
  const row = {
    project_id: c.project.id,
    slug: p.data.slug,
    theme: p.data.theme,
    title: p.data.title || null,
    sections,
    indexable: p.data.indexable,
    updated_at: new Date().toISOString(),
  };
  const { error } = c.site
    ? await sb.from("wedding_sites").update(row).eq("project_id", c.project.id)
    : await sb.from("wedding_sites").insert(row);
  if (error) {
    if (error.message.includes("wedding_sites_slug_key") || /duplicate key/i.test(error.message)) {
      return fail("That address is taken. Try adding your wedding year.");
    }
    return fail(error.message);
  }
  return ok({ slug: p.data.slug });
}

export async function setSitePassword(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(SetSitePasswordInput, input);
  if (!p.ok) return p;
  const pw = p.data.password?.trim() ?? "";
  if (p.data.password !== null && pw.length < 4) return fail("Use at least 4 characters.");
  const c = await context(sb, userId);
  if ("error" in c) return fail(c.error!);
  if (!c.active) return fail(LOCKED);
  if (!c.site) return fail("Save your site first.");
  const { error } = await sb
    .from("wedding_sites")
    .update({ password_hash: pw ? hashSitePassword(pw) : null, updated_at: new Date().toISOString() })
    .eq("project_id", c.project.id);
  return error ? fail(error.message) : ok({ hasPassword: !!pw });
}

export async function publishSite(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(PublishSiteInput, input);
  if (!p.ok) return p;
  const c = await context(sb, userId);
  if ("error" in c) return fail(c.error!);
  if (!c.active) return fail(LOCKED);
  if (!c.site) return fail("Save your site first.");
  const published_at = p.data.published ? (c.site.published_at ?? new Date().toISOString()) : null;
  const { error } = await sb.from("wedding_sites").update({ published_at }).eq("project_id", c.project.id);
  return error ? fail(error.message) : ok({ slug: c.site.slug, published: p.data.published });
}

async function writePhotos(sb: Sb, projectId: string, photos: SitePhoto[]) {
  const { error } = await sb
    .from("wedding_sites")
    .update({ photos, updated_at: new Date().toISOString() })
    .eq("project_id", projectId);
  return error ? fail(error.message) : ok({ photos });
}

export const SiteUploadInput = z.object({ contentType: z.enum(["image/webp", "image/jpeg"]), bytes: z.number().int().positive() });
export type SiteUploadInput = z.input<typeof SiteUploadInput>;

/** A one-time upload ticket for one website photo, if the site has room. */
export async function requestSitePhotoUpload(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(SiteUploadInput, input);
  if (!p.ok) return p;
  const problem = uploadProblem("sites", p.data.contentType, p.data.bytes);
  if (problem) return fail(problem);
  const c = await context(sb, userId);
  if ("error" in c) return fail(c.error!);
  if (!c.active) return fail(LOCKED);
  if (!c.site) return fail("Save your site first.");
  if (c.site.photos.length >= MAX_SITE_PHOTOS) return fail(`Your site can have up to ${MAX_SITE_PHOTOS} photos.`);
  const path = `${c.project.id}/${randomUUID()}.${p.data.contentType === "image/jpeg" ? "jpg" : "webp"}`;
  return ok({ path, ticket: await uploadTicket("sites", path, p.data) });
}

/** Record a photo the browser already uploaded to {projectId}/{uuid}.webp. */
export async function addSitePhoto(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(SitePhotoInput, input);
  if (!p.ok) return p;
  const c = await context(sb, userId);
  if ("error" in c) return fail(c.error!);
  const cleanup = () => removeObjects("sites", [p.data.path]);
  if (!isOwnSitePath(c.project.id, p.data.path)) return fail("That photo isn't in your wedding's folder.");
  const bad = await verifyUpload("sites", p.data.path);
  if (bad) return fail(bad);
  const refusal = !c.active
    ? LOCKED
    : !c.site
      ? "Save your site first."
      : c.site.photos.length >= MAX_SITE_PHOTOS
        ? `Your site can have up to ${MAX_SITE_PHOTOS} photos.`
        : null;
  if (refusal || !c.site) {
    await cleanup();
    return fail(refusal ?? "Save your site first.");
  }
  return writePhotos(sb, c.project.id, [...c.site.photos, p.data]);
}

export async function removeSitePhoto(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(SitePhotoRef, input);
  if (!p.ok) return p;
  const c = await context(sb, userId);
  if ("error" in c) return fail(c.error!);
  if (!c.active) return fail(LOCKED);
  if (!c.site?.photos.some((x) => x.path === p.data.path)) return fail("Photo not found.");
  const r = await writePhotos(sb, c.project.id, c.site.photos.filter((x) => x.path !== p.data.path));
  if (r.ok) await removeObjects("sites", [p.data.path]);
  return r;
}

/** Move a photo to position `to` (0 = cover). */
export async function moveSitePhoto(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(SitePhotoRef, input);
  if (!p.ok) return p;
  const c = await context(sb, userId);
  if ("error" in c) return fail(c.error!);
  if (!c.active) return fail(LOCKED);
  const list = [...(c.site?.photos ?? [])];
  const from = list.findIndex((x) => x.path === p.data.path);
  if (from < 0) return fail("Photo not found.");
  const [item] = list.splice(from, 1);
  list.splice(Math.min(p.data.to ?? 0, list.length), 0, item);
  return writePhotos(sb, c.project.id, list);
}
