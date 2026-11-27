"use server";
// Guests sharing photos: get one-time upload URLs, upload in the browser, then record each photo.
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { headObject, removeObjects, uploadProblem, uploadTicket, verifyUpload, type UploadTicket } from "@/lib/storage";
import { guestQuota, openSiteFor } from "@/lib/public-site-access";
import { MAX_PER_BATCH, MAX_PHOTOS, UPLOADS_PER_DAY, isGuestPhotoPath } from "@/lib/photo-share";
import { loadPhotoSettings } from "@/lib/photo-share-data";

type Fail = { ok: false; error: string };

type FileSpec = { contentType: string; bytes: number };

/** One-time upload tickets, one per (already shrunk) photo. Type and size are part of each ticket. */
export async function startPhotoUploadsAction(
  slug: string,
  files: FileSpec[]
): Promise<{ ok: true; uploads: { path: string; ticket: UploadTicket }[] } | Fail> {
  const site = await openSiteFor(slug, "photo_share");
  if (!site) return { ok: false, error: "Photo sharing isn't open on this site." };
  const n = Array.isArray(files) ? files.length : 0;
  if (!(n >= 1 && n <= MAX_PER_BATCH)) return { ok: false, error: `Send up to ${MAX_PER_BATCH} photos at a time.` };
  for (const f of files) {
    const problem = uploadProblem("guest-photos", String(f?.contentType), Number(f?.bytes));
    if (problem) return { ok: false, error: problem };
  }
  const { count: have } = await supabaseAdmin.from("guest_photos").select("id", { count: "exact", head: true }).eq("project_id", site.projectId);
  if ((have ?? 0) + n > MAX_PHOTOS) return { ok: false, error: "This wedding's photo album is full." };
  for (let i = 0; i < n; i++) {
    if (!(await guestQuota("photo-upload", UPLOADS_PER_DAY))) return { ok: false, error: "That's a lot of photos for one day! Try again tomorrow." };
  }
  try {
    const uploads = await Promise.all(
      files.map(async (f) => {
        const path = `${site.projectId}/${randomUUID()}.${f.contentType === "image/jpeg" ? "jpg" : "webp"}`;
        return { path, ticket: await uploadTicket("guest-photos", path, { contentType: f.contentType, bytes: Math.floor(f.bytes) }) };
      })
    );
    return { ok: true, uploads };
  } catch {
    return { ok: false, error: "Couldn't prepare the upload. Please try again." };
  }
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

  const bad = await verifyUpload("guest-photos", photo.path);
  if (bad) return { ok: false, error: bad };
  const bytes = (await headObject("guest-photos", photo.path))?.bytes ?? 0;

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
    await removeObjects("guest-photos", [photo.path]);
    return { ok: false, error: error.message.includes("photo_limit") ? "This wedding's photo album is full." : "Please try again." };
  }
  if (!approve_first) revalidatePath(`/w/${site.slug}/photos`);
  return { ok: true, pending: approve_first };
}
