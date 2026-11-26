// src/lib/wedding-site.ts — the Wedding Website: themes, slugs and page sections (no database here).

export const SITE_BUCKET = "wedding-sites";
export const MAX_SITE_PHOTOS = 10;

export const THEMES = {
  classic: { name: "Classic", font: "serif", bg: "#fbf8f3", ink: "#2b2622", accent: "#8a6a3b", soft: "#efe7da" },
  garden: { name: "Garden", font: "serif", bg: "#f5f7f2", ink: "#26302a", accent: "#5d7a5c", soft: "#e3eadf" },
  modern: { name: "Modern", font: "sans", bg: "#ffffff", ink: "#111111", accent: "#111111", soft: "#f1f1f1" },
  blush: { name: "Blush", font: "serif", bg: "#fdf6f5", ink: "#3a2a2c", accent: "#b46a72", soft: "#f6e3e3" },
  midnight: { name: "Midnight", font: "sans", bg: "#14182b", ink: "#eef0f7", accent: "#d6b36a", soft: "#21284a" },
} as const;
export type ThemeKey = keyof typeof THEMES;

// ---------- slugs ----------

export const RESERVED_SLUGS = new Set([
  "admin", "api", "app", "help", "knotly", "login", "signin", "signup", "support", "vendors", "www", "rsvp", "photos",
  "registry", "settings", "static", "assets", "test", "demo", "about", "terms", "privacy",
]);
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export function slugError(slug: string): string | null {
  if (!SLUG_RE.test(slug) || slug.includes("--")) return "Use 3–40 lowercase letters, numbers and single dashes.";
  if (RESERVED_SLUGS.has(slug)) return "That address is reserved. Try another.";
  return null;
}

/** "Priya & Sam" → "priya-and-sam"; accents dropped. */
export function suggestSlug(partnerNames: string | null | undefined, year?: number | null): string {
  const base = (partnerNames ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s*(&|\+)\s*/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 34)
    .replace(/-+$/, "");
  const s = base.length >= 3 ? base : "our-wedding";
  return year ? `${s}-${year}` : s;
}

// ---------- sections ----------

export type TravelItem = { title: string; details: string; url: string };
export type PartyMember = { name: string; role: string };
export type FaqItem = { q: string; a: string };

export type Section =
  | { type: "hero"; enabled: boolean; subtitle: string }
  | { type: "story"; enabled: boolean; text: string }
  | { type: "schedule"; enabled: boolean }
  | { type: "travel"; enabled: boolean; items: TravelItem[] }
  | { type: "party"; enabled: boolean; members: PartyMember[] }
  | { type: "faq"; enabled: boolean; items: FaqItem[] }
  | { type: "gallery"; enabled: boolean }
  | { type: "rsvp"; enabled: boolean }
  | { type: "registry"; enabled: boolean }
  | { type: "photos"; enabled: boolean };
export type SectionType = Section["type"];

export const SECTION_LABELS: Record<SectionType, string> = {
  hero: "Welcome",
  story: "Our story",
  schedule: "Schedule",
  travel: "Travel & stay",
  party: "Wedding party",
  faq: "FAQ",
  gallery: "Photos of us",
  rsvp: "RSVP",
  registry: "Registry",
  photos: "Share your photos",
};

/** Sections that only show once their own add-on is unlocked. */
export const ADDON_SECTIONS: Partial<Record<SectionType, string>> = { rsvp: "rsvp", registry: "registry", photos: "photo_share" };

export function defaultSections(loveStory?: string | null): Section[] {
  return [
    { type: "hero", enabled: true, subtitle: "We're getting married!" },
    { type: "story", enabled: !!loveStory, text: loveStory ?? "" },
    { type: "schedule", enabled: true },
    { type: "travel", enabled: false, items: [] },
    { type: "party", enabled: false, members: [] },
    { type: "faq", enabled: false, items: [] },
    { type: "gallery", enabled: true },
    { type: "rsvp", enabled: true },
    { type: "registry", enabled: true },
    { type: "photos", enabled: true },
  ];
}

/** Stored sections in their saved order, with any missing type added at its default place. */
export function normalizeSections(stored: unknown, loveStory?: string | null): Section[] {
  const defaults = defaultSections(loveStory);
  const list = Array.isArray(stored) ? (stored as Section[]) : [];
  const seen = new Set<string>();
  const out: Section[] = [];
  for (const s of list) {
    const d = defaults.find((x) => x.type === s?.type);
    if (!d || seen.has(s.type)) continue;
    seen.add(s.type);
    out.push({ ...d, ...s } as Section);
  }
  for (const d of defaults) if (!seen.has(d.type)) out.push(d);
  return out;
}

/** What actually renders: enabled, has something to show, and (for add-on sections) unlocked. */
export function visibleSections(
  sections: Section[],
  o: { owned: string[]; hasEvents: boolean; hasPhotos: boolean }
): Section[] {
  return sections.filter((s) => {
    if (!s.enabled) return false;
    const addon = ADDON_SECTIONS[s.type];
    if (addon && !o.owned.includes(addon)) return false;
    switch (s.type) {
      case "story":
        return !!s.text.trim();
      case "schedule":
        return o.hasEvents;
      case "travel":
      case "faq":
        return s.items.length > 0;
      case "party":
        return s.members.length > 0;
      case "gallery":
        return o.hasPhotos;
      default:
        return true;
    }
  });
}

export type SitePhoto = { path: string; width: number; height: number; caption?: string };

export function sitePhotoUrl(path: string, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${SITE_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** A path inside this wedding's folder, like {projectId}/{uuid}.webp. */
export const isOwnSitePath = (projectId: string, path: string) =>
  new RegExp(`^${projectId}/[0-9a-f-]{36}\\.(webp|jpg)$`).test(path);

export function formatWeddingDate(d: string | null | undefined) {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Map link for a venue/address. */
export const mapUrl = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

/** Only http(s) links on the public page. */
export function safeUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
