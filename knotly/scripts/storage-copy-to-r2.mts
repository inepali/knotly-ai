// scripts/storage-copy-to-r2.mts — copy files from Supabase Storage into the R2 bucket.
// Safe to re-run: a file already in R2 with the same size is skipped. Nothing is deleted.
//
//   node --env-file=.env.local --experimental-strip-types scripts/storage-copy-to-r2.mts [area ...] [--dry-run]
//
// Areas: avatars portfolio knowledge sites guest-photos (default: all). Needs
// NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and the four R2_* variables.
// (Cloudflare's Super Slurper can do the same from the dashboard; keys go in as area/path.)
import { createClient } from "@supabase/supabase-js";
// Node's type stripping needs the .ts extension; TypeScript only allows it with a flag.
// @ts-expect-error TS5097
import { presignUrl } from "../src/lib/storage/sigv4.ts";
// @ts-expect-error TS5097
import { AREAS, AREA_NAMES, isArea, r2Key, type Area } from "../src/lib/storage/areas.ts";

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing ${k}`);
  return v;
};
const sb = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const r2 = {
  host: `${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  bucket: env("R2_BUCKET"),
  accessKeyId: env("R2_ACCESS_KEY_ID"),
  secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
};
const sign = (method: "HEAD" | "PUT", key: string, headers?: Record<string, string>) =>
  presignUrl({ method, host: r2.host, path: `/${r2.bucket}/${key}`, accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey, expiresIn: 600, headers });

const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const picked = args.filter((a) => !a.startsWith("--"));
for (const a of picked) if (!isArea(a)) throw new Error(`Unknown area "${a}". Use: ${AREA_NAMES.join(" ")}`);
const areas = (picked.length ? picked : AREA_NAMES) as Area[];

/** Every file in a bucket: folders are one level deep ({uuid}/{file}). */
async function listAll(bucket: string) {
  const out: { path: string; size: number; type: string }[] = [];
  const page = async (prefix: string, cb: (o: { name: string; id: string | null; metadata: Record<string, unknown> | null }) => void) => {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000, offset });
      if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
      data.forEach(cb);
      if (data.length < 1000) break;
    }
  };
  const folders: string[] = [];
  await page("", (o) => (o.id ? out.push({ path: o.name, size: Number(o.metadata?.size ?? 0), type: String(o.metadata?.mimetype ?? "") }) : folders.push(o.name)));
  for (const f of folders) {
    await page(f, (o) => {
      if (o.id) out.push({ path: `${f}/${o.name}`, size: Number(o.metadata?.size ?? 0), type: String(o.metadata?.mimetype ?? "application/octet-stream") });
    });
  }
  return out;
}

let copied = 0, skipped = 0, failed = 0;
for (const area of areas) {
  const bucket = AREAS[area].supabaseBucket;
  const files = await listAll(bucket);
  console.log(`${area}: ${files.length} file(s) in "${bucket}"`);
  for (const f of files) {
    const key = r2Key(area, f.path);
    const head = await fetch(sign("HEAD", key), { method: "HEAD" });
    if (head.ok && Number(head.headers.get("content-length")) === f.size) {
      skipped++;
      continue;
    }
    if (dry) {
      console.log(`  would copy ${key} (${f.size} bytes)`);
      continue;
    }
    try {
      const { data, error } = await sb.storage.from(bucket).download(f.path);
      if (error || !data) throw new Error(error?.message ?? "download failed");
      const body = new Uint8Array(await data.arrayBuffer());
      const headers: Record<string, string> = {
        "Content-Type": f.type || data.type || "application/octet-stream",
        "Content-Length": String(body.byteLength),
        ...(AREAS[area].public ? { "Cache-Control": "public, max-age=31536000, immutable" } : {}),
      };
      const sendHeaders = Object.fromEntries(Object.entries(headers).filter(([k]) => k !== "Content-Length"));
      const put = await fetch(sign("PUT", key, headers), { method: "PUT", headers: sendHeaders, body });
      if (!put.ok) throw new Error(`PUT ${put.status}: ${(await put.text()).slice(0, 200)}`);
      copied++;
    } catch (e) {
      failed++;
      console.error(`  failed ${key}: ${e instanceof Error ? e.message : e}`);
    }
  }
}
console.log(`${dry ? "Dry run. " : ""}Copied ${copied}, already there ${skipped}, failed ${failed}.`);
process.exitCode = failed ? 1 : 0;
