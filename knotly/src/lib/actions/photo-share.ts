// src/lib/actions/photo-share.ts — the couple's side of Guest Photo Sharing (add-on).
import { z } from "zod";
import { PHOTO_BUCKET, photosExpireAt } from "@/lib/photo-share";
import { loadPhotoSettings, loadPhotos, withSignedUrls } from "@/lib/photo-share-data";
import { getProject } from "./wedding";
import { fail, ok, parseInput, type Sb } from "./result";

const NO_PROJECT = "Save your wedding details on My Wedding first.";
export const ModerateInput = z.object({ ids: z.array(z.uuid()).min(1).max(500), status: z.enum(["pending", "approved", "hidden"]) });
export type ModerateInput = z.input<typeof ModerateInput>;
export const DeletePhotosInput = z.object({ ids: z.array(z.uuid()).min(1).max(500) });
export type DeletePhotosInput = z.input<typeof DeletePhotosInput>;
export const PhotoSettingsInput = z.object({ approve_first: z.boolean() });
export type PhotoSettingsInput = z.input<typeof PhotoSettingsInput>;

export async function loadPhotoShare(sb: Sb, userId: string) {
  const project = await getProject(sb, userId);
  if (!project) return fail(NO_PROJECT);
  const pid = project.id as string;
  const [{ data: active }, settings, photos, { data: site }] = await Promise.all([
    sb.rpc("has_addon", { p_project: pid, p_key: "photo_share" }),
    loadPhotoSettings(sb, pid),
    loadPhotos(sb, pid, false),
    sb.from("wedding_sites").select("slug, published_at").eq("project_id", pid).maybeSingle(),
  ]);
  const oldest = photos.at(-1)?.created_at;
  return ok({
    active: !!active,
    settings,
    photos: await withSignedUrls(sb, photos),
    site: site as { slug: string; published_at: string | null } | null,
    expiresAt: oldest ? photosExpireAt(project.wedding_date as string | null, oldest).toISOString() : null,
  });
}

export async function setPhotoSettings(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(PhotoSettingsInput, input);
  if (!p.ok) return p;
  const project = await getProject(sb, userId);
  if (!project) return fail(NO_PROJECT);
  const { error } = await sb
    .from("photo_share_settings")
    .upsert({ project_id: project.id, ...p.data, updated_at: new Date().toISOString() }, { onConflict: "project_id" });
  return error ? fail(error.message.includes("row-level security") ? "Unlock Guest Photo Sharing first." : error.message) : ok(p.data);
}

/** Approve, hide or send back to pending. RLS keeps it to this wedding's photos. */
export async function moderatePhotos(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(ModerateInput, input);
  if (!p.ok) return p;
  const { data, error } = await sb.from("guest_photos").update({ status: p.data.status }).in("id", p.data.ids).select("id");
  if (error) return fail(error.message);
  return ok({ updated: data?.length ?? 0 });
}

export async function deletePhotos(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(DeletePhotosInput, input);
  if (!p.ok) return p;
  const { data, error } = await sb.from("guest_photos").delete().in("id", p.data.ids).select("path");
  if (error) return fail(error.message);
  const paths = (data ?? []).map((d) => d.path as string);
  if (paths.length) await sb.storage.from(PHOTO_BUCKET).remove(paths);
  return ok({ removed: paths.length });
}
