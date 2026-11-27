// src/lib/storage/areas.ts — the kinds of files Knotly stores, their limits, and how they map to
// storage. Safe to import in the browser (no secrets, no env). See r2-storage-migration-spec.md.

export type Area = "avatars" | "portfolio" | "knowledge" | "sites" | "guest-photos";
export type PublicArea = "portfolio" | "sites";

export const AREAS: Record<Area, { supabaseBucket: string; maxBytes: number; types: string[]; public: boolean }> = {
  avatars: { supabaseBucket: "avatars", maxBytes: 1_048_576, types: ["image/jpeg", "image/png", "image/webp"], public: false },
  portfolio: { supabaseBucket: "vendor-portfolio", maxBytes: 3_145_728, types: ["image/webp", "image/jpeg"], public: true },
  knowledge: { supabaseBucket: "vendor-knowledge", maxBytes: 10_485_760, types: ["application/pdf"], public: false },
  sites: { supabaseBucket: "wedding-sites", maxBytes: 3_145_728, types: ["image/webp", "image/jpeg"], public: true },
  "guest-photos": { supabaseBucket: "guest-photos", maxBytes: 5_242_880, types: ["image/webp", "image/jpeg"], public: false },
};
export const AREA_NAMES = Object.keys(AREAS) as Area[];
export const isArea = (s: string): s is Area => s in AREAS;
export const isPublicArea = (s: string): s is PublicArea => isArea(s) && AREAS[s].public;

/** Paths are "{uuid}/{file}" (owner or wedding id, then a file name). Nothing else is ever stored. */
const PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9-]{1,100}\.(webp|jpg|png|pdf)$/;
export const isSafePath = (path: string) => PATH_RE.test(path);

/** The object key in R2: one bucket, a folder per area. */
export const r2Key = (area: Area, path: string) => `${area}/${path}`;

/**
 * Where a public image is shown: a stable Knotly URL that redirects to wherever the file lives
 * (R2 or Supabase). Relative unless `base` (e.g. siteUrl()) is given — absolute is needed for
 * emails, Open Graph and JSON-LD.
 */
export function mediaUrl(area: PublicArea, path: string, base = "") {
  return `${base.replace(/\/$/, "")}/media/${area}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Does this upload fit the area's rules? (Checked before signing and again after upload.) */
export function uploadProblem(area: Area, contentType: string, bytes: number): string | null {
  const a = AREAS[area];
  if (!a.types.includes(contentType)) return "That file type isn't allowed here.";
  if (!(bytes > 0 && bytes <= a.maxBytes)) return `That file is too large (max ${Math.round(a.maxBytes / 1_048_576)} MB).`;
  return null;
}

/** Which provider holds an area: STORAGE_PROVIDER=r2 moves everything; STORAGE_R2_AREAS moves some. */
export function providerFor(area: Area, env: Record<string, string | undefined> = process.env): "r2" | "supabase" {
  if (env.STORAGE_PROVIDER === "r2") return "r2";
  const some = (env.STORAGE_R2_AREAS ?? "").split(",").map((s) => s.trim());
  return some.includes(area) ? "r2" : "supabase";
}

/** How the browser should upload one file (from the server's upload ticket). */
export type UploadTicket =
  | { via: "r2"; url: string; headers: Record<string, string> }
  | { via: "supabase"; bucket: string; path: string; token: string; contentType: string };
