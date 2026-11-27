// /w/[slug] — a couple's public wedding website. Hidden from search engines unless they opt in;
// optional password; shows a thank-you page once the add-on's window has passed.
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { loadPublicSite } from "@/lib/public-site";
import { isUnlocked, unlockCookieName } from "@/lib/site-password";
import { formatWeddingDate, sitePhotoUrl } from "@/lib/wedding-site";
import { siteUrl } from "@/lib/site";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadPublicRegistry } from "@/lib/registry-data";
import WeddingSite from "@/components/website/WeddingSite";
import SitePasswordGate from "@/components/website/SitePasswordGate";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = await loadPublicSite((await params).slug);
  if (!site) return { title: "Not found", robots: { index: false } };
  const date = formatWeddingDate(site.weddingDate);
  const open = !site.passwordHash;
  const cover = open && site.photos[0] ? sitePhotoUrl(site.photos[0].path, siteUrl()) : undefined;
  return {
    title: `${site.title}${date ? ` · ${date}` : ""}`,
    description: open ? [date, site.place].filter(Boolean).join(" · ") || "Our wedding" : "Our wedding",
    robots: { index: site.indexable && open && !site.archived, follow: false },
    alternates: { canonical: `${siteUrl()}/w/${site.slug}` },
    openGraph: { title: site.title, images: cover ? [cover] : undefined },
  };
}

export default async function WeddingSitePage({ params }: Props) {
  const { slug } = await params;
  const site = await loadPublicSite(slug);
  if (!site) notFound();
  const cookie = (await cookies()).get(unlockCookieName(site.slug))?.value;
  if (!isUnlocked(site.slug, site.passwordHash, cookie)) {
    return <SitePasswordGate slug={site.slug} title={site.title} theme={site.theme} />;
  }
  const registry = site.owned.includes("registry") && !site.archived ? await loadPublicRegistry(supabaseAdmin, site.projectId) : null;
  return <WeddingSite site={site} registry={registry} />;
}
