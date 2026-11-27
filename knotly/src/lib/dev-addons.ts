// src/lib/dev-addons.ts — for development and testing: DEV_UNLOCK_ALL_ADDONS=true unlocks every
// paid add-on for any wedding that opens the dashboard, without Stripe.
//
// Database rules (has_addon) also check entitlements, so this grants real couple_addons rows
// (source 'admin') rather than only skipping checks in the app. It never runs on Vercel Production.
// Turning the flag off doesn't remove the grants; see README ("Testing add-ons").
import type { SupabaseClient } from "@supabase/supabase-js";

export const DEV_GRANT_YEARS = 5;

/** True only when the flag is on and this isn't a Vercel production deployment. */
export function devUnlockAll(env: Record<string, string | undefined> = process.env): boolean {
  return env.DEV_UNLOCK_ALL_ADDONS === "true" && env.VERCEL_ENV !== "production";
}

const granted = new Set<string>(); // per server instance: grant once per wedding

/** Give this wedding every active one-time add-on (service-role client). Safe to call often. */
export async function ensureDevAddons(
  admin: SupabaseClient,
  projectId: string,
  env: Record<string, string | undefined> = process.env
): Promise<boolean> {
  if (!devUnlockAll(env) || granted.has(projectId)) return false;
  const { data: catalog, error } = await admin.from("addon_catalog").select("key").eq("active", true).eq("kind", "one_time");
  if (error || !catalog?.length) return false;
  const until = new Date(Date.now() + DEV_GRANT_YEARS * 365 * 86_400_000).toISOString();
  const { error: upsertError } = await admin
    .from("couple_addons")
    .upsert(
      catalog.map((c) => ({ project_id: projectId, addon_key: c.key as string, source: "admin", active_until: until })),
      { onConflict: "project_id,addon_key", ignoreDuplicates: true } // never touch real purchases
    );
  if (upsertError) {
    console.error("[dev-addons] grant failed", upsertError.message);
    return false;
  }
  granted.add(projectId);
  return true;
}

/** For tests. */
export const resetDevGrants = () => granted.clear();
