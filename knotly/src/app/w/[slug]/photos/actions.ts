"use server";
// Guests sharing photos: get one-time upload URLs, upload in the browser, then record each photo.
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { guestQuota, openSiteFor } from "@/lib/public-site-access";
import { MAX_PER_BATCH, MAX_PHOTOS, PHOTO_BUCKET, UPLOADS_PER_DAY, isGuestPhotoPath } from "@/lib/photo-share";
import { loadPhotoSettings } from "@/lib/photo-share-data";

type Fail = { ok: false; error: string };

export async function startPhotoUploadsAction(
  slug: string,
  count: number
): Promise<{ ok: true; uploads: { path: string; token: string }[] } | Fail> {
  const site = await openSiteFor(slug, "photo_share");
  if (!site) return { ok: false, error: "Photo sharing isn't open on this site." };
  const n = Math.floor(count);
  if (!(n >= 1 && n <= MAX_PER_BATCH)) return { ok: false, error: `Send up to ${MAX_PER_BATCH} photos at a time.` };
  const { count: have } = await supabaseAdmin.from("guest_photos").select("id", { count: "exact", head: true }).eq("project_id", site.projectId);
  if ((have ?? 0) + n > MAX_PHOTOS) return { ok: false, error: "This wedding's photo album is full." };
  for (let i = 0; i < n; i++) {
    if (!(await guestQuota("photo-upload", UPLOADS_PER_DAY))) return { ok: false, error: "That's a lot of photos for one day! Try again tomorrow." };
  }
  const uploads: { path: string; token: string }[] = [];
  for (let i = 0; i < n; i++) {
    const path = `${site.projectId}/${randomUUID()}.webp`;
    const { data, error } = await supabaseAdmin.storage.from(PHOTO_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { ok: false, error: "Couldn't prepare the upload. Please try again." };
    uploads.push({ path, token: data.token });
  }
  return { ok: true, uploads };
}

/** Record an uploaded photo, after checking the file really is in this wedding's folder. */
export async function recordPhotoAction(
  slug: string,
  photo: { path: string; width: number; height: number; name: string; website?: string }
): Promise<{ ok: true; pending: boolean } | Fail> {
  if (photo.website) return { ok: false, error: "Something went wrong." }; // honeypot
  const site = await openSiteFor(slug, "photo_share");
  if (!site) return { ok: false, error: "Photo sharing isn't open on this site." };
  if (!isGuestPhotoPath(site.projectId, photo.path)) return { ok: false, error: "That upload isn't valid." };
  const w = Math.round(photo.width), h = Math.round(photo.height);
  if (!(w >= 1 && w <= 10000 && h >= 1 && h <= 10000)) return { ok: false, error: "That upload isn't valid." };

  const [folder, file] = photo.path.split("/");
  const { data: found } = await supabaseAdmin.storage.from(PHOTO_BUCKET).list(folder, { search: file, limit: 1 });
  const obj = found?.find((f) => f.name === file);
  const bytes = Number((obj?.metadata as { size?: number } | undefined)?.size ?? 0);
  if (!obj || !bytes) return { ok: false, error: "The photo didn't finish uploading. Please try again." };

  const { approve_first } = await loadPhotoSettings(supabaseAdmin, site.projectId);
  const { error } = await supabaseAdmin.from("guest_photos").insert({
    project_id: site.projectId,
    path: photo.path,
    width: w,
    height: h,
    bytes,
    uploader_name: (photo.name ?? "").trim().slice(0, 60) || null,
    status: approve_first ? "pending" : "approved",
  });
  if (error) {
    await supabaseAdmin.storage.from(PHOTO_BUCKET).remove([photo.path]);
    return { ok: false, error: error.message.includes("photo_limit") ? "This wedding's photo album is full." : "Please try again." };
  }
  if (!approve_first) revalidatePath(`/w/${site.slug}/photos`);
  return { ok: true, pending: approve_first };
}
