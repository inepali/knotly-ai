// src/lib/site.ts — the public address of the app, for links, canonical URLs, sitemaps and emails.
export const SITE_NAME = "Knotly";

const clean = (u: string) => u.replace(/\/$/, "");
const https = (host?: string) => (host ? `https://${host}` : "");

/**
 * The app's address when there's no request to look at (sitemaps, canonical links, crons):
 * APP_URL; else on Vercel the production domain (production) or this deployment's branch URL
 * (preview); else localhost.
 */
export function siteUrl() {
  const e = process.env;
  if (e.APP_URL) return clean(e.APP_URL);
  if (e.VERCEL_ENV === "production" && e.VERCEL_PROJECT_PRODUCTION_URL) return https(e.VERCEL_PROJECT_PRODUCTION_URL);
  if (e.VERCEL_ENV) return https(e.VERCEL_BRANCH_URL || e.VERCEL_URL) || "http://localhost:3000";
  return "http://localhost:3000";
}

/**
 * The address this page was opened at, for links people copy, print, scan or get emailed
 * (a preview link stays on the preview, localhost on localhost). Production always uses siteUrl(),
 * so a Host header can never point those links anywhere else.
 */
export async function requestSiteUrl() {
  if (process.env.VERCEL_ENV === "production") return siteUrl();
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
    if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) return siteUrl();
    const proto = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim() || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
    return `${proto === "http" ? "http" : "https"}://${host}`;
  } catch {
    return siteUrl(); // outside a request
  }
}
