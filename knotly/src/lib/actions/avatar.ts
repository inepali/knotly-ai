// src/lib/actions/avatar.ts — a person's profile photo. Files live in the private "avatars"
// area under their own user id; profiles.avatar_path points at the current one. Callers only pass
// paths the signed-in person can already see (their own, or a profile RLS let them read).
import { putObject, removeObjects, signedUrl } from "@/lib/storage";
import { fail, ok, type Sb } from "./result";

export const AVATAR_BUCKET = "avatars"; // Supabase bucket name (see lib/storage/areas)
export const AVATAR_MAX_BYTES = 800_000; // the browser shrinks photos well below this
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** A one-hour link to show the photo, or null when there isn't one. */
export async function avatarUrl(_sb: Sb, path: string | null | undefined) {
  if (!path) return null;
  return signedUrl("avatars", path, 3600).catch(() => null);
}

export async function saveAvatar(sb: Sb, userId: string, file: unknown) {
  if (!(file instanceof File) || file.size === 0) return fail("Choose a photo first.");
  const ext = TYPES[file.type];
  if (!ext) return fail("Use a JPG, PNG or WebP photo.");
  if (file.size > AVATAR_MAX_BYTES) return fail("That photo is too large. Try a smaller one.");

  const { data: profile } = await sb.from("profiles").select("avatar_path").eq("id", userId).maybeSingle();
  const path = `${userId}/avatar-${Date.now()}.${ext}`;

  try {
    await putObject("avatars", path, file, file.type);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't save the photo.");
  }

  const { error } = await sb.from("profiles").update({ avatar_path: path }).eq("id", userId);
  if (error) {
    await removeObjects("avatars", [path]); // don't leave an orphan
    return fail(error.message);
  }
  if (profile?.avatar_path) await removeObjects("avatars", [profile.avatar_path]);
  return ok({ path });
}

export async function removeAvatar(sb: Sb, userId: string) {
  const { data: profile } = await sb.from("profiles").select("avatar_path").eq("id", userId).maybeSingle();
  if (!profile?.avatar_path) return ok({ path: null });
  const { error } = await sb.from("profiles").update({ avatar_path: null }).eq("id", userId);
  if (error) return fail(error.message);
  await removeObjects("avatars", [profile.avatar_path]);
  return ok({ path: null });
}
