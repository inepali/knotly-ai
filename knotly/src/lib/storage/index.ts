// src/lib/storage/index.ts — every server-side file operation goes through here.
// Each area lives in Cloudflare R2 or Supabase Storage (see providerFor); callers don't care.
// R2 has no row-level security, so callers check permissions BEFORE asking for a ticket or URL.
import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { presignUrl } from "./sigv4";
import { AREAS, providerFor, r2Key, type Area, type PublicArea, type UploadTicket } from "./areas";

export * from "./areas";

export const UPLOAD_TICKET_SECONDS = 300;
export const PUBLIC_LINK_SECONDS = 24 * 60 * 60;

function r2() {
  // Trimmed: a stray space or line break pasted into a setting would break every signature.
  const [R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET] = [
    process.env.R2_ACCOUNT_ID, process.env.R2_ACCESS_KEY_ID, process.env.R2_SECRET_ACCESS_KEY, process.env.R2_BUCKET,
  ].map((v) => v?.trim());
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    throw new Error("R2 isn't configured: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET.");
  }
  return { host: `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, bucket: R2_BUCKET, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY };
}

function r2Url(method: "GET" | "PUT" | "HEAD" | "DELETE", area: Area, path: string, expiresIn: number, headers?: Record<string, string>) {
  const c = r2();
  return presignUrl({ method, host: c.host, path: `/${c.bucket}/${r2Key(area, path)}`, accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, expiresIn, headers });
}

const bucket = (area: Area) => supabaseAdmin.storage.from(AREAS[area].supabaseBucket);

/** A one-time upload for the browser. Content type (and size, on R2) are part of the signature. */
export async function uploadTicket(area: Area, path: string, opts: { contentType: string; bytes: number }): Promise<UploadTicket> {
  if (providerFor(area) === "r2") {
    const headers: Record<string, string> = {
      "Content-Type": opts.contentType,
      "Content-Length": String(opts.bytes),
      ...(AREAS[area].public ? { "Cache-Control": "public, max-age=31536000, immutable" } : {}),
    };
    return { via: "r2", url: r2Url("PUT", area, path, UPLOAD_TICKET_SECONDS, headers), headers: withoutLength(headers) };
  }
  const { data, error } = await bucket(area).createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message ?? "Couldn't prepare the upload.");
  return { via: "supabase", bucket: AREAS[area].supabaseBucket, path, token: data.token, contentType: opts.contentType };
}
// Browsers set Content-Length themselves from the body (and refuse to let scripts set it).
const withoutLength = (h: Record<string, string>) => Object.fromEntries(Object.entries(h).filter(([k]) => k !== "Content-Length"));

/** Upload from the server (e.g. avatars, which arrive as a form post). */
export async function putObject(area: Area, path: string, body: Blob | ArrayBuffer | Uint8Array, contentType: string) {
  if (providerFor(area) === "r2") {
    const bytes = body instanceof Blob ? body.size : body.byteLength;
    const headers = { "Content-Type": contentType, "Content-Length": String(bytes) };
    const res = await fetch(r2Url("PUT", area, path, 60, headers), { method: "PUT", headers: withoutLength(headers), body: body as BodyInit });
    if (!res.ok) throw new Error(`R2 upload failed (${res.status})`);
    return;
  }
  const { error } = await bucket(area).upload(path, body, { contentType, upsert: false });
  if (error) throw new Error(error.message);
}

/** Read a whole file on the server (e.g. a PDF to index). */
export async function getObject(area: Area, path: string): Promise<ArrayBuffer> {
  if (providerFor(area) === "r2") {
    const res = await fetch(r2Url("GET", area, path, 60));
    if (!res.ok) throw new Error(`Couldn't open the file (${res.status}).`);
    return res.arrayBuffer();
  }
  const { data, error } = await bucket(area).download(path);
  if (error || !data) throw new Error("Couldn't open the file.");
  return data.arrayBuffer();
}

/** Size and type of a stored file, or null when it isn't there. */
export async function headObject(area: Area, path: string): Promise<{ bytes: number; contentType: string } | null> {
  if (providerFor(area) === "r2") {
    const res = await fetch(r2Url("HEAD", area, path, 60), { method: "HEAD" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`R2 HEAD failed (${res.status})`);
    return { bytes: Number(res.headers.get("content-length") ?? 0), contentType: res.headers.get("content-type") ?? "" };
  }
  const [folder, file] = [path.slice(0, path.lastIndexOf("/")), path.slice(path.lastIndexOf("/") + 1)];
  const { data } = await bucket(area).list(folder, { search: file, limit: 1 });
  const obj = data?.find((f) => f.name === file);
  if (!obj) return null;
  const meta = (obj.metadata ?? {}) as { size?: number; mimetype?: string };
  return { bytes: Number(meta.size ?? 0), contentType: meta.mimetype ?? "" };
}

/** Short-lived links to private files (or any file). */
export async function signedUrls(area: Area, paths: string[], expiresIn: number): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!paths.length) return out;
  if (providerFor(area) === "r2") {
    for (const p of paths) out.set(p, r2Url("GET", area, p, expiresIn));
    return out;
  }
  const { data } = await bucket(area).createSignedUrls(paths, expiresIn);
  for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  return out;
}

export async function signedUrl(area: Area, path: string, expiresIn: number): Promise<string | null> {
  return (await signedUrls(area, [path], expiresIn)).get(path) ?? null;
}

/** Where /media/{area}/{path} should redirect: R2 signed link, or the Supabase public URL. */
export function publicTarget(area: PublicArea, path: string): string {
  if (providerFor(area) === "r2") return r2Url("GET", area, path, PUBLIC_LINK_SECONDS);
  return bucket(area).getPublicUrl(path).data.publicUrl;
}

/** Delete files. Missing files are fine. */
export async function removeObjects(area: Area, paths: string[]) {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  if (providerFor(area) === "r2") {
    await Promise.all(
      list.map(async (p) => {
        const res = await fetch(r2Url("DELETE", area, p, 60), { method: "DELETE" });
        if (!res.ok && res.status !== 404) console.error("[storage] R2 delete failed", area, p, res.status);
      })
    );
    return;
  }
  const { error } = await bucket(area).remove(list);
  if (error) console.error("[storage] delete failed", area, error.message);
}

/**
 * After the browser says it uploaded: the file must exist and fit the area's rules.
 * A file that doesn't fit is deleted. Returns a problem message, or null when it's fine.
 */
export async function verifyUpload(area: Area, path: string): Promise<string | null> {
  const h = await headObject(area, path);
  if (!h || !h.bytes) return "The file didn't finish uploading. Please try again.";
  const a = AREAS[area];
  const typeOk = !h.contentType || a.types.includes(h.contentType.split(";")[0].trim());
  if (h.bytes > a.maxBytes || !typeOk) {
    await removeObjects(area, [path]);
    return "That file isn't allowed here.";
  }
  return null;
}
