// src/lib/actions/vendor-portfolio.ts — a vendor's portfolio photos and video links (shared by the
// dashboard's Portfolio page). The browser asks for upload tickets (requestPortfolioUpload), sends
// the photo and thumbnail straight to storage (R2 or Supabase, see lib/storage), then these functions
// record, edit, reorder and delete them. Limits are enforced by the database trigger.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { fail, ok, parseInput, type Sb } from "./result";
import { MAX_IMAGES, MAX_VIDEOS, isOwnPhotoPath, parseVideoUrl, portfolioError } from "@/lib/portfolio";
import { removeObjects, uploadProblem, uploadTicket, verifyUpload } from "@/lib/storage";

const Id = z.uuid();
const Caption = z.string().trim().max(200).optional();

export const AddPortfolioImageInput = z.object({
  storagePath: z.string().max(200),
  thumbPath: z.string().max(200),
  caption: Caption,
  width: z.number().int().positive().max(20000),
  height: z.number().int().positive().max(20000),
});
export type AddPortfolioImageInput = z.input<typeof AddPortfolioImageInput>;

const FileSpec = z.object({ contentType: z.enum(["image/webp", "image/jpeg"]), bytes: z.number().int().positive() });
export const RequestPortfolioUploadInput = z.object({ full: FileSpec, thumb: FileSpec });
export type RequestPortfolioUploadInput = z.input<typeof RequestPortfolioUploadInput>;
const ext = (t: string) => (t === "image/jpeg" ? "jpg" : "webp");

export const UpdatePortfolioImageInput = z.object({ id: Id, caption: Caption, isCover: z.boolean().optional() });
export type UpdatePortfolioImageInput = z.input<typeof UpdatePortfolioImageInput>;

export const DeletePortfolioItemInput = z.object({ id: Id });
export type DeletePortfolioItemInput = z.input<typeof DeletePortfolioItemInput>;

export const ReorderPortfolioInput = z.object({
  kind: z.enum(["image", "video"]),
  ids: z.array(Id).min(1).max(MAX_IMAGES),
});
export type ReorderPortfolioInput = z.input<typeof ReorderPortfolioInput>;

export const AddPortfolioVideoInput = z.object({
  url: z.string().trim().min(1, "Paste a YouTube or Vimeo link.").max(500),
  title: z.string().trim().max(120).optional(),
});
export type AddPortfolioVideoInput = z.input<typeof AddPortfolioVideoInput>;

const IMAGES = "vendor_portfolio_images";
const VIDEOS = "vendor_portfolio_videos";

export type PortfolioImage = {
  id: string;
  storage_path: string;
  thumb_path: string;
  caption: string | null;
  sort_order: number;
  is_cover: boolean;
  width: number | null;
  height: number | null;
};
export type PortfolioVideo = { id: string; provider: "youtube" | "vimeo"; video_id: string; url: string; title: string | null; sort_order: number };

/** Photos (cover first, then the vendor's order) and videos. Works for any reader RLS allows. */
export async function getPortfolio(sb: Sb, vendorId: string) {
  const [images, videos] = await Promise.all([
    sb
      .from(IMAGES)
      .select("id, storage_path, thumb_path, caption, sort_order, is_cover, width, height")
      .eq("vendor_id", vendorId)
      .order("sort_order")
      .order("created_at"),
    sb.from(VIDEOS).select("id, provider, video_id, url, title, sort_order").eq("vendor_id", vendorId).order("sort_order").order("created_at"),
  ]);
  const imgs = (images.data ?? []) as PortfolioImage[];
  return {
    images: [...imgs.filter((i) => i.is_cover), ...imgs.filter((i) => !i.is_cover)],
    videos: (videos.data ?? []) as PortfolioVideo[],
  };
}

/** Two one-time upload tickets (photo + thumbnail) in this vendor's folder, if there's room. */
export async function requestPortfolioUpload(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(RequestPortfolioUploadInput, input);
  if (!p.ok) return p;
  const problem = uploadProblem("portfolio", p.data.full.contentType, p.data.full.bytes) ?? uploadProblem("portfolio", p.data.thumb.contentType, p.data.thumb.bytes);
  if (problem) return fail(problem);
  const { count } = await sb.from(IMAGES).select("id", { count: "exact", head: true }).eq("vendor_id", userId);
  if ((count ?? 0) >= MAX_IMAGES) return fail(`You can have up to ${MAX_IMAGES} photos.`);
  const id = randomUUID();
  const storagePath = `${userId}/${id}.${ext(p.data.full.contentType)}`;
  const thumbPath = `${userId}/${id}-thumb.${ext(p.data.thumb.contentType)}`;
  const [full, thumb] = await Promise.all([
    uploadTicket("portfolio", storagePath, p.data.full),
    uploadTicket("portfolio", thumbPath, p.data.thumb),
  ]);
  return ok({ storagePath, thumbPath, tickets: { full, thumb } });
}

/** Record a photo the browser just uploaded. If that fails (e.g. the 25-photo limit), delete the files. */
export async function addPortfolioImage(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(AddPortfolioImageInput, input);
  if (!p.ok) return p;
  const { storagePath, thumbPath, caption, width, height } = p.data;
  if (!isOwnPhotoPath(userId, storagePath) || !isOwnPhotoPath(userId, thumbPath) || !thumbPath.includes("-thumb.")) {
    return fail("That upload doesn't belong to your account.");
  }
  const problem = (await verifyUpload("portfolio", storagePath)) ?? (await verifyUpload("portfolio", thumbPath));
  if (problem) {
    await removeObjects("portfolio", [storagePath, thumbPath]);
    return fail(problem);
  }

  const { data: last } = await sb.from(IMAGES).select("sort_order").eq("vendor_id", userId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await sb
    .from(IMAGES)
    .insert({
      vendor_id: userId,
      storage_path: storagePath,
      thumb_path: thumbPath,
      caption: caption || null,
      width,
      height,
      sort_order: ((last as { sort_order?: number } | null)?.sort_order ?? -1) + 1,
    })
    .select("id")
    .single();
  if (error) {
    await removeObjects("portfolio", [storagePath, thumbPath]);
    return fail(portfolioError(error.message));
  }
  return ok({ id: (data as { id: string }).id });
}

/** Edit a caption and/or make a photo the cover (there's only ever one). */
export async function updatePortfolioImage(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(UpdatePortfolioImageInput, input);
  if (!p.ok) return p;
  const { id, caption, isCover } = p.data;

  if (isCover) {
    // Clear the old cover first: the unique index allows one per vendor.
    const { error } = await sb.from(IMAGES).update({ is_cover: false }).eq("vendor_id", userId).eq("is_cover", true);
    if (error) return fail(error.message);
  }
  const patch = { ...(caption !== undefined && { caption: caption || null }), ...(isCover !== undefined && { is_cover: isCover }) };
  if (!Object.keys(patch).length) return ok({ id });
  const { data, error } = await sb.from(IMAGES).update(patch).eq("id", id).eq("vendor_id", userId).select("id").maybeSingle();
  if (error) return fail(error.message);
  if (!data) return fail("That photo isn't in your portfolio.");
  return ok({ id });
}

/** Delete a photo row and both of its files. */
export async function deletePortfolioImage(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(DeletePortfolioItemInput, input);
  if (!p.ok) return p;
  const { data, error } = await sb.from(IMAGES).delete().eq("id", p.data.id).eq("vendor_id", userId).select("storage_path, thumb_path").maybeSingle();
  if (error) return fail(error.message);
  if (!data) return fail("That photo isn't in your portfolio.");
  const row = data as { storage_path: string; thumb_path: string };
  await removeObjects("portfolio", [row.storage_path, row.thumb_path]);
  return ok({ id: p.data.id });
}

/** Save the order the vendor arranged: ids[0] comes first. Only their own rows change. */
export async function reorderPortfolio(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(ReorderPortfolioInput, input);
  if (!p.ok) return p;
  const table = p.data.kind === "image" ? IMAGES : VIDEOS;
  if (p.data.kind === "video" && p.data.ids.length > MAX_VIDEOS) return fail(`You can add up to ${MAX_VIDEOS} videos.`);
  if (new Set(p.data.ids).size !== p.data.ids.length) return fail("Each item can appear only once.");
  const results = await Promise.all(p.data.ids.map((id, i) => sb.from(table).update({ sort_order: i }).eq("id", id).eq("vendor_id", userId)));
  const bad = results.find((r) => r.error);
  if (bad?.error) return fail(bad.error.message);
  return ok({ count: p.data.ids.length });
}

/** Add a YouTube or Vimeo link (anything else is refused). */
export async function addPortfolioVideo(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(AddPortfolioVideoInput, input);
  if (!p.ok) return p;
  const video = parseVideoUrl(p.data.url);
  if (!video) return fail("Only YouTube and Vimeo links are supported.");

  const { data: last } = await sb.from(VIDEOS).select("sort_order").eq("vendor_id", userId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await sb
    .from(VIDEOS)
    .insert({
      vendor_id: userId,
      provider: video.provider,
      video_id: video.videoId,
      url: p.data.url,
      title: p.data.title || null,
      sort_order: ((last as { sort_order?: number } | null)?.sort_order ?? -1) + 1,
    })
    .select("id")
    .single();
  if (error) return fail(portfolioError(error.message));
  return ok({ id: (data as { id: string }).id, ...video });
}

export async function deletePortfolioVideo(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(DeletePortfolioItemInput, input);
  if (!p.ok) return p;
  const { data, error } = await sb.from(VIDEOS).delete().eq("id", p.data.id).eq("vendor_id", userId).select("id").maybeSingle();
  if (error) return fail(error.message);
  if (!data) return fail("That video isn't in your portfolio.");
  return ok({ id: p.data.id });
}
