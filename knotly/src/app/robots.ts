// src/app/robots.ts — /robots.txt: public pages are open; accounts, dashboards, messages and
// the private couple-only vendor pages are kept out of search.
import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/client/", "/vendor/", "/vendors/", "/inbox", "/signin", "/signup"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
