// src/lib/addon-access.ts — gate an add-on page: the couple's project if the add-on is active,
// otherwise a redirect to its preview (where they can unlock it).
import "server-only";
import { redirect } from "next/navigation";
import { requireCouple } from "@/lib/couple-session";
import { getProject } from "@/lib/actions/wedding";
import type { AddonKey } from "@/lib/addons";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ensureDevAddons } from "@/lib/dev-addons";

export async function requireAddon(key: AddonKey | "guest_list") {
  const { sb, userId } = await requireCouple();
  const project = await getProject(sb, userId);
  if (!project) redirect("/client/dashboard/my-wedding");
  await ensureDevAddons(supabaseAdmin, project.id); // no-op unless DEV_UNLOCK_ALL_ADDONS=true (never in production)
  const { data: active } = await sb.rpc("has_addon", { p_project: project.id, p_key: key });
  if (!active) redirect(`/client/dashboard/add-ons/${key}`);
  return { sb, userId, project };
}
