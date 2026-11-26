// src/lib/actions/avatar.ts — a person's profile photo. Files live in the private "avatars"
// bucket under their own user id; profiles.avatar_path points at the current one.
import { fail, ok, type Sb } from "./result";

export const AVATAR_BUCKET = "avatars";
export const AVATAR_MAX_BYTES = 800_000; // the browser shrinks photos well below this
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** A one-hour link to show the photo, or null when there isn't one. */
export async function avatarUrl(sb: Sb, path: string | null | undefined) {
  if (!path) return null;
  const { data } = await sb.storage.from(AVATAR_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function saveAvatar(sb: Sb, userId: string, file: unknown) {
  if (!(file instanceof File) || file.size === 0) return fail("Choose a photo first.");
  const ext = TYPES[file.type];
  if (!ext) return fail("Use a JPG, PNG or WebP photo.");
  if (file.size > AVATAR_MAX_BYTES) return fail("That photo is too large. Try a smaller one.");

  const { data: profile } = await sb.from("profiles").select("avatar_path").eq("id", userId).maybeSingle();
  const path = `${userId}/avatar-${Date.now()}.${ext}`;

  const { error: uploadError } = await sb.storage.from(AVATAR_BUCKET).upload(path, file, { contentType: file.type });
  if (uploadError) return fail(uploadError.message);

  const { error } = await sb.from("profiles").update({ avatar_path: path }).eq("id", userId);
  if (error) {
    await sb.storage.from(AVATAR_BUCKET).remove([path]); // don't leave an orphan
    return fail(error.message);
  }
  if (profile?.avatar_path) await sb.storage.from(AVATAR_BUCKET).remove([profile.avatar_path]);
  return ok({ path });
}

export async function removeAvatar(sb: Sb, userId: string) {
  const { data: profile } = await sb.from("profiles").select("avatar_path").eq("id", userId).maybeSingle();
  if (!profile?.avatar_path) return ok({ path: null });
  const { error } = await sb.from("profiles").update({ avatar_path: null }).eq("id", userId);
  if (error) return fail(error.message);
  await sb.storage.from(AVATAR_BUCKET).remove([profile.avatar_path]);
  return ok({ path: null });
}
