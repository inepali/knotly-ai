// src/lib/public-site.ts — load a published wedding website for /w/[slug].
// Uses the service role, so it selects only what the public page shows: never budget, contact
// details or anything from the guest list.
import "server-only";
import { supabaseAdmin as db } from "@/lib/supabase/admin";
import { normalizeSections, type SitePhoto, type ThemeKey } from "@/lib/wedding-site";

export async function loadPublicSite(slug: string) {
  const { data: site } = await db
    .from("wedding_sites")
    .select("project_id, slug, theme, title, sections, photos, password_hash, indexable, published_at")
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  if (!site?.published_at) return null;

  const [{ data: project }, { data: events }, { data: owned }] = await Promise.all([
    db.from("couple_projects").select("partner_names, wedding_date, venue, love_story, metros(name, state)").eq("id", site.project_id).single(),
    db.from("wedding_events").select("id, name, starts_at, venue, address, notes").eq("project_id", site.project_id).order("sort"),
    db.from("couple_addons").select("addon_key, active_until").eq("project_id", site.project_id),
  ]);
  if (!project) return null;
  const now = Date.now();
  const active = (owned ?? []).filter((o) => new Date(o.active_until).getTime() > now).map((o) => o.addon_key as string);
  const ever = (owned ?? []).map((o) => o.addon_key as string);
  if (!ever.includes("website")) return null; // never bought (or refunded)

  const m = project.metros as unknown as { name: string; state: string } | null;
  const metro = m ? `${m.name}, ${m.state}` : null;
  return {
    slug: site.slug as string,
    theme: site.theme as ThemeKey,
    title: (site.title as string | null) || (project.partner_names as string | null) || "Our wedding",
    sections: normalizeSections(site.sections, project.love_story as string | null),
    photos: (site.photos ?? []) as SitePhoto[],
    passwordHash: (site.password_hash as string | null) ?? null,
    indexable: !!site.indexable,
    weddingDate: (project.wedding_date as string | null) ?? null,
    place: [project.venue, metro].filter(Boolean).join(" · "),
    events: events ?? [],
    owned: active,
    /** Past the add-on's window: show the thank-you view instead of the full site. */
    archived: !active.includes("website"),
  };
}
export type PublicSite = NonNullable<Awaited<ReturnType<typeof loadPublicSite>>>;
