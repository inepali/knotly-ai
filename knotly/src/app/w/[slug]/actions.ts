"use server";
// Unlock a password-protected wedding website for this browser (30 days).
import { cookies } from "next/headers";
import { loadPublicSite } from "@/lib/public-site";
import { checkSitePassword, unlockCookieName, unlockToken } from "@/lib/site-password";

export async function unlockSiteAction(slug: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const site = await loadPublicSite(slug);
  if (!site?.passwordHash) return { ok: true };
  if (!password || password.length > 100 || !checkSitePassword(password, site.passwordHash)) {
    await new Promise((r) => setTimeout(r, 400)); // slow down guessing a little
    return { ok: false, error: "That password isn't right. Check with the couple." };
  }
  (await cookies()).set(unlockCookieName(site.slug), unlockToken(site.slug, site.passwordHash), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/w/${site.slug}`,
    maxAge: 60 * 60 * 24 * 30,
  });
  return { ok: true };
}
