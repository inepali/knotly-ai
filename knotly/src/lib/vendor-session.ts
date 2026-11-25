// src/lib/vendor-session.ts — who's asking, for the vendor dashboard's pages and server actions.
import "server-only";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { homeFor } from "@/lib/auth";

/** Signed-in vendor, or a redirect: guests to /signin, everyone else to their own home. */
export async function requireVendor() {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || user.is_anonymous) redirect("/signin");
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "vendor") redirect(homeFor(profile?.role));
  return { sb, userId: user.id };
}

/** Same check for server actions, which answer with an error instead of redirecting. */
export async function vendorOrError(): Promise<
  | { error: string; sb?: undefined; userId?: undefined }
  | { error?: undefined; sb: SupabaseClient; userId: string }
> {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || user.is_anonymous) return { error: "Please sign in." };
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "vendor") return { error: "This is for vendor accounts." };
  return { sb, userId: user.id };
}
