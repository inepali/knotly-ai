// src/lib/site.ts — the public address of the app, for canonical links, sitemaps and sharing.
export const SITE_NAME = "Knotly";

/** APP_URL without a trailing slash; localhost when it isn't set. */
export function siteUrl() {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}
