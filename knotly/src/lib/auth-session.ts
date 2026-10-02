// src/lib/auth-session.ts — server-side steps shared by sign-in and password reset
import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

// After someone signs in (password or reset code): look up their role and, for a
// couple, fold anything they did as a guest this visit into their saved wedding.
// Saved values win; differences are returned. Vendors and admins have nothing to merge.
export async function completeSignIn(guestId: string | null, userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  const role: string = profile?.role ?? "couple";

  let conflicts: unknown[] = [];
  if (role === "couple" && guestId && guestId !== userId) {
    const { data, error } = await supabaseAdmin.rpc("merge_guest_into_user", {
      p_guest: guestId,
      p_user: userId,
    });
    if (error) console.error("[auth] merge guest", error.message);
    conflicts = data ?? [];
  }
  return { role, conflicts };
}
