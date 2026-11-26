// /w/[slug]/photos — guests share their photos (no account) and see the approved ones.
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadPublicSite } from "@/lib/public-site";
import { isUnlocked, unlockCookieName } from "@/lib/site-password";
import { loadPhotos, withSignedUrls } from "@/lib/photo-share-data";
import { themeStyle } from "@/components/website/theme";
import SitePasswordGate from "@/components/website/SitePasswordGate";
import PhotoUploader from "@/components/photos/PhotoUploader";

export const metadata: Metadata = { title: "Share your photos", robots: { index: false, follow: false } };

export default async function GuestPhotosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await loadPublicSite(slug);
  if (!site || site.archived || !site.owned.includes("photo_share")) notFound();
  const cookie = (await cookies()).get(unlockCookieName(site.slug))?.value;
  if (!isUnlocked(site.slug, site.passwordHash, cookie)) return <SitePasswordGate slug={site.slug} title={site.title} theme={site.theme} />;

  const photos = await withSignedUrls(supabaseAdmin, (await loadPhotos(supabaseAdmin, site.projectId, true)).slice(0, 300));
  return (
    <main style={themeStyle(site.theme)} className="min-h-dvh px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <Link href={`/w/${site.slug}`} className="text-sm underline opacity-80">← {site.title}</Link>
        <h1 className="mt-6 text-center text-4xl">Share your photos</h1>
        <p className="mt-2 text-center opacity-80">Help {site.title} relive the day. No app or account needed.</p>
        <PhotoUploader slug={site.slug} />
        {photos.length > 0 && (
          <ul className="mt-10 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((p) =>
              p.url ? (
                <li key={p.id}>
                  <a href={p.url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed link */}
                    <img src={p.url} alt={p.uploader_name ? `Photo by ${p.uploader_name}` : "Guest photo"} loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
                  </a>
                </li>
              ) : null
            )}
          </ul>
        )}
      </div>
    </main>
  );
}
