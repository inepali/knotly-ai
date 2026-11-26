// src/lib/photo-share-data.ts — guest photos with short-lived signed links. The db client is the
// couple's (RLS) on the dashboard, or the service role for the public gallery (approved only).
import type { SupabaseClient } from "@supabase/supabase-js";
import { PHOTO_BUCKET, SIGNED_URL_SECONDS, type GuestPhoto } from "./photo-share";

export async function withSignedUrls(db: SupabaseClient, photos: GuestPhoto[]): Promise<GuestPhoto[]> {
  if (!photos.length) return photos;
  const { data } = await db.storage.from(PHOTO_BUCKET).createSignedUrls(photos.map((p) => p.path), SIGNED_URL_SECONDS);
  const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return photos.map((p) => ({ ...p, url: byPath.get(p.path) ?? undefined }));
}

export async function loadPhotos(db: SupabaseClient, projectId: string, onlyApproved: boolean) {
  let q = db
    .from("guest_photos")
    .select("id, path, width, height, uploader_name, status, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (onlyApproved) q = q.eq("status", "approved");
  const { data } = await q;
  return (data ?? []) as GuestPhoto[];
}

export async function loadPhotoSettings(db: SupabaseClient, projectId: string) {
  const { data } = await db.from("photo_share_settings").select("approve_first").eq("project_id", projectId).maybeSingle();
  return { approve_first: (data?.approve_first as boolean | undefined) ?? true };
}
