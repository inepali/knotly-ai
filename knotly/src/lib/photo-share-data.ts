// src/lib/photo-share-data.ts — guest photos with short-lived signed links. The db client is the
// couple's (RLS) on the dashboard, or the service role for the public gallery (approved only).
import type { SupabaseClient } from "@supabase/supabase-js";
import { signedUrls } from "@/lib/storage";
import { SIGNED_URL_SECONDS, type GuestPhoto } from "./photo-share";

/** Links for photos the caller already loaded through `db` (so RLS has decided who sees what). */
export async function withSignedUrls(_db: SupabaseClient, photos: GuestPhoto[]): Promise<GuestPhoto[]> {
  if (!photos.length) return photos;
  const byPath = await signedUrls("guest-photos", photos.map((p) => p.path), SIGNED_URL_SECONDS);
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
