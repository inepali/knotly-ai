// src/app/sitemap.ts — /sitemap.xml: the home page and every published vendor's public page.
import type { MetadataRoute } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/site";
import { vendorPath } from "@/lib/vendor-seo";

export const dynamic = "force-dynamic"; // read the current vendors on each request

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const home = { url: base, changeFrequency: "weekly" as const, priority: 1 };

  const { data, error } = await supabaseAdmin
    .from("vendors")
    .select("slug, category, metro_slug, updated_at")
    .eq("published", true)
    .not("slug", "is", null)
    .not("metro_slug", "is", null)
    .limit(5000);
  if (error || !data) return [home]; // e.g. the slug migration hasn't run yet

  const pages = data.flatMap((v) => {
    const path = vendorPath(v);
    return path
      ? [
          {
            url: `${base}${path}`,
            lastModified: v.updated_at ? new Date(v.updated_at) : undefined,
            changeFrequency: "weekly" as const,
            priority: 0.7,
          },
        ]
      : [];
  });
  return [home, ...pages];
}
