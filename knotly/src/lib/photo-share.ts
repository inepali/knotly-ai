// src/lib/photo-share.ts — Guest Photo Sharing: limits, paths and retention (no database).
export const PHOTO_BUCKET = "guest-photos";
export const MAX_PHOTOS = 1000;
export const MAX_PER_BATCH = 20; // photos one guest can send in one go
export const UPLOADS_PER_DAY = 150; // per network address
export const PHOTO_EDGE = 2400;
export const SIGNED_URL_SECONDS = 60 * 60;
export const KEEP_DAYS_AFTER_WEDDING = 365;
export const DOWNLOAD_GRACE_DAYS = 30;

export type GuestPhoto = {
  id: string;
  path: string;
  width: number;
  height: number;
  uploader_name: string | null;
  status: "pending" | "approved" | "hidden";
  created_at: string;
  url?: string;
};

export const isGuestPhotoPath = (projectId: string, path: string) => new RegExp(`^${projectId}/[0-9a-f-]{36}\\.(webp|jpg)$`).test(path);

/** When guest photos are deleted for good: a year after the wedding plus a download grace period. */
export function photosExpireAt(weddingDate: string | null, firstUpload: string): Date {
  const base = weddingDate ? new Date(`${weddingDate}T12:00:00Z`) : new Date(firstUpload);
  return new Date(base.getTime() + (KEEP_DAYS_AFTER_WEDDING + DOWNLOAD_GRACE_DAYS) * 86_400_000);
}

/** Split into zip parts so a phone or laptop doesn't hold a gigabyte in memory at once. */
export const zipParts = <T,>(xs: T[], perPart = 150) => Array.from({ length: Math.ceil(xs.length / perPart) }, (_, i) => xs.slice(i * perPart, (i + 1) * perPart));
