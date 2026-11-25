// src/lib/couple-session.ts — who's asking, for the couple dashboard's pages and server actions.
import "server-only";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { homeFor } from "@/lib/auth";

/** Signed-in, non-guest couple, or a redirect: guests to /signin, vendors to their home. */
export async function requireCouple() {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || user.is_anonymous) redirect("/signin");
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role === "vendor") redirect(homeFor("vendor"));
  return { sb, userId: user.id };
}

/** Same check for server actions, which answer with an error instead of redirecting. */
export async function coupleOrError(): Promise<
  | { error: string; sb?: undefined; userId?: undefined }
  | { error?: undefined; sb: SupabaseClient; userId: string }
> {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || user.is_anonymous) return { error: "Please sign in." };
  return { sb, userId: user.id };
}
