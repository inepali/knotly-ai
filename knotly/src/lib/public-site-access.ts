// src/lib/public-site-access.ts — shared checks for guest actions on a wedding website:
// the site is published, unlocked in this browser, and the add-on is active; plus per-IP daily caps.
import "server-only";
import { cookies, headers } from "next/headers";
import { loadPublicSite } from "@/lib/public-site";
import { isUnlocked, unlockCookieName } from "@/lib/site-password";
import { helpSubject, takeHelpQuota } from "@/lib/help-limit";

export async function openSiteFor(slug: string, addon: string) {
  const site = await loadPublicSite(slug);
  if (!site || site.archived || !site.owned.includes(addon)) return null;
  const cookie = (await cookies()).get(unlockCookieName(site.slug))?.value;
  if (!isUnlocked(site.slug, site.passwordHash, cookie)) return null;
  return site;
}

/** Count one guest action for this network address; false once today's cap is reached. */
export async function guestQuota(kind: string, limit: number) {
  const { subject } = helpSubject(null, (await headers()).get("x-forwarded-for"));
  return takeHelpQuota(`${kind}:${subject}`, limit);
}
