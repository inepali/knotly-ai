// src/lib/portfolio.ts — a vendor's portfolio: limits, photo addresses and video links.
// Pure and safe to import in the browser. Keep the limits in sync with the
// vendor_portfolio migration's trigger. See docs/specs/vendor-portfolio-spec.md.

export const MAX_IMAGES = 25;
export const MAX_VIDEOS = 3;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // what we accept before shrinking in the browser
export const FULL_EDGE = 2400; // long edge of the stored photo
export const THUMB_EDGE = 600; // long edge of the grid/card thumbnail
export const PORTFOLIO_BUCKET = "vendor-portfolio";
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/** Public CDN address of a file in the portfolio bucket. */
export function portfolioUrl(path: string, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${PORTFOLIO_BUCKET}/${encoded}`;
}

/** A file this vendor may point a row at: {vendorId}/{uuid}.webp|jpg or the matching -thumb. */
export function isOwnPhotoPath(vendorId: string, path: string) {
  const m = path.match(/^([0-9a-f-]{36})\/([0-9a-f-]{36})(-thumb)?\.(webp|jpg)$/);
  return !!m && m[1] === vendorId;
}

/** How many of `wanted` files still fit, and how many would be skipped. */
export function fitBatch(existing: number, wanted: number, max = MAX_IMAGES) {
  const room = Math.max(0, max - existing);
  return { take: Math.min(room, wanted), skipped: Math.max(0, wanted - room) };
}

export type Video = { provider: "youtube" | "vimeo"; videoId: string };

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{5,12}$/;

/** YouTube or Vimeo link -> { provider, videoId }, or null for anything else. */
export function parseVideoUrl(raw: string): Video | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^(www\.|m\.)/, "");
  const parts = u.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") return YT_ID.test(parts[0] ?? "") ? { provider: "youtube", videoId: parts[0] } : null;
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const id = parts[0] === "watch" ? u.searchParams.get("v") : ["shorts", "embed", "live"].includes(parts[0]) ? parts[1] : null;
    return id && YT_ID.test(id) ? { provider: "youtube", videoId: id } : null;
  }
  if (host === "vimeo.com") {
    const id = parts.find((p) => VIMEO_ID.test(p));
    return id ? { provider: "vimeo", videoId: id } : null;
  }
  if (host === "player.vimeo.com" && parts[0] === "video") {
    return VIMEO_ID.test(parts[1] ?? "") ? { provider: "vimeo", videoId: parts[1] } : null;
  }
  return null;
}

/** The iframe address, built only from the parsed id (never from pasted HTML). */
export function embedUrl(v: Video) {
  return v.provider === "youtube"
    ? `https://www.youtube-nocookie.com/embed/${v.videoId}?autoplay=1&rel=0`
    : `https://player.vimeo.com/video/${v.videoId}?autoplay=1`;
}

/** A still for the click-to-play button. Vimeo has no fixed address for one, so null. */
export const videoThumbUrl = (v: Video) => (v.provider === "youtube" ? `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg` : null);

/** Alt text: the caption, else "Golden Hour photographer photo 3, Charlotte, NC". */
export function photoAlt(caption: string | null | undefined, o: { business: string; kind: string; n: number; place?: string | null }) {
  const c = caption?.trim();
  if (c) return c;
  return `${o.business} ${o.kind.toLowerCase()} photo ${o.n}${o.place ? `, ${o.place}` : ""}`;
}

type ImageRow = { storage_path: string; thumb_path: string; caption: string | null; width: number | null; height: number | null };
type VideoRow = { id: string; provider: "youtube" | "vimeo"; video_id: string; title: string | null };

/** Portfolio rows -> what the gallery shows: public URLs and alt text for every photo. */
export function toGallery(
  p: { images: ImageRow[]; videos: VideoRow[] },
  o: { business: string; kind: string; place?: string | null },
  supabaseUrl?: string
) {
  return {
    photos: p.images.map((img, i) => ({
      full: portfolioUrl(img.storage_path, supabaseUrl),
      thumb: portfolioUrl(img.thumb_path, supabaseUrl),
      alt: photoAlt(img.caption, { ...o, n: i + 1 }),
      caption: img.caption,
      width: img.width,
      height: img.height,
    })),
    videos: p.videos.map((v) => ({ id: v.id, provider: v.provider, videoId: v.video_id, title: v.title })),
  };
}

/** Turn the database's limit error into words. */
export function portfolioError(message: string) {
  const m = message.match(/portfolio_limit:(\d+)/);
  if (m) return m[1] === String(MAX_VIDEOS) ? `You can add up to ${MAX_VIDEOS} videos.` : `You can add up to ${MAX_IMAGES} photos.`;
  if (/duplicate key.*provider/.test(message)) return "That video is already in your portfolio.";
  return message;
}

/** Long edge capped at `max`, aspect kept. */
export function fitWithin(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
