// src/lib/admin-session.ts — who's asking, for admin pages and server actions.
// Admins are set in the database (profiles.role = 'admin'); sign-up never makes one.
import "server-only";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { homeFor } from "@/lib/auth";

export async function requireAdmin() {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || user.is_anonymous) redirect("/signin");
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect(homeFor(profile?.role));
  return { userId: user.id };
}

/** Same check for server actions, which answer with an error instead of redirecting. */
export async function adminOrError(): Promise<{ error: string; userId?: undefined } | { error?: undefined; userId: string }> {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || user.is_anonymous) return { error: "Please sign in." };
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { error: "This is for Knotly admins." };
  return { userId: user.id };
}
