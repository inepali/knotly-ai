// scripts/storage-check.mts — check the R2 setup end to end, from your machine.
//
//   node --env-file=.env.local --experimental-strip-types scripts/storage-check.mts [origin]
//
// origin = the address you open the app at (default http://localhost:3000). It checks:
//   1. the R2 settings are present and look right
//   2. the keys can write, read and delete a test file (so signing and credentials work)
//   3. the bucket's CORS rules let a browser on `origin` upload (what "Upload failed" usually is)
// Prints what's wrong and how to fix it. Never prints the secret.
// @ts-expect-error TS5097 (Node's type stripping needs the .ts extension)
import { presignUrl } from "../src/lib/storage/sigv4.ts";

const origin = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
let problems = 0;
const ok = (m: string) => console.log(`  ✓ ${m}`);
const bad = (m: string, fix: string) => {
  problems++;
  console.log(`  ✗ ${m}\n    → ${fix}`);
};

console.log("1. Settings");
const raw = {
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID ?? "",
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID ?? "",
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ?? "",
  R2_BUCKET: process.env.R2_BUCKET ?? "",
};
for (const [k, v] of Object.entries(raw)) {
  if (!v) bad(`${k} is empty`, `add it to .env.local`);
  else if (v !== v.trim()) bad(`${k} has spaces or a line break around it`, "remove them (and any quotes)");
}
if (/^https?:|\./.test(raw.R2_ACCOUNT_ID)) bad("R2_ACCOUNT_ID looks like a URL", "use only the 32-character account ID, not the endpoint address");
else if (raw.R2_ACCOUNT_ID && !/^[0-9a-f]{32}$/.test(raw.R2_ACCOUNT_ID.trim())) bad("R2_ACCOUNT_ID isn't 32 hex characters", "copy it from Cloudflare → R2 → Account details");
if (raw.R2_ACCESS_KEY_ID && raw.R2_ACCESS_KEY_ID.trim().length !== 32) bad("R2_ACCESS_KEY_ID isn't 32 characters", "use the Access Key ID from the R2 API token (not the token value)");
if (raw.R2_SECRET_ACCESS_KEY && raw.R2_SECRET_ACCESS_KEY.trim().length !== 64) bad("R2_SECRET_ACCESS_KEY isn't 64 characters", "use the Secret Access Key from the R2 API token");
if (/[A-Z_ ]/.test(raw.R2_BUCKET)) bad("R2_BUCKET has capitals, spaces or underscores", "use the bucket's exact name, e.g. knotly-files");
console.log(`  storage: STORAGE_PROVIDER=${process.env.STORAGE_PROVIDER ?? "(unset)"} STORAGE_R2_AREAS=${process.env.STORAGE_R2_AREAS ?? "(unset)"}`);
if (problems) {
  console.log(`\n${problems} problem(s). Fix the settings, restart \`pnpm dev\`, and run this again.`);
  process.exit(1);
}
ok("present and well-formed");

const c = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v.trim()])) as typeof raw;
const host = `${c.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const key = `portfolio/00000000-0000-4000-8000-000000000000/storage-check-${Date.now()}.webp`;
const sign = (method: "PUT" | "GET" | "HEAD" | "DELETE", headers?: Record<string, string>) =>
  presignUrl({ method, host, path: `/${c.R2_BUCKET}/${key}`, accessKeyId: c.R2_ACCESS_KEY_ID, secretAccessKey: c.R2_SECRET_ACCESS_KEY, expiresIn: 300, headers });
const why = async (r: Response) => ((await r.text()).match(/<Code>([^<]+)<\/Code>/)?.[1] ?? "") || `HTTP ${r.status}`;

console.log("2. Keys and bucket");
const body = new Uint8Array([82, 73, 70, 70]);
const headers = { "Content-Type": "image/webp", "Content-Length": String(body.byteLength), "Cache-Control": "public, max-age=31536000, immutable" };
let wrote = false;
try {
  const put = await fetch(sign("PUT", headers), { method: "PUT", headers: { "Content-Type": headers["Content-Type"], "Cache-Control": headers["Cache-Control"] }, body });
  if (put.ok) {
    wrote = true;
    ok("upload works");
  } else {
    const code = await why(put);
    const fix: Record<string, string> = {
      NoSuchBucket: `there's no bucket named "${c.R2_BUCKET}" in this account; check R2_BUCKET`,
      InvalidAccessKeyId: "the access key doesn't exist (or belongs to another account); make a new R2 API token",
      SignatureDoesNotMatch: "the secret doesn't match the access key; copy both again from the same token",
      AccessDenied: "the token can't write to this bucket; give it Object Read & Write on this bucket",
    };
    bad(`upload refused: ${code}`, fix[code] ?? "check the token's permissions and the bucket name");
  }
} catch (e) {
  bad(`couldn't reach ${host}`, `check R2_ACCOUNT_ID (${e instanceof Error ? e.message : e})`);
}
if (wrote) {
  const head = await fetch(sign("HEAD"), { method: "HEAD" });
  head.ok ? ok("read works") : bad(`read refused (HTTP ${head.status})`, "give the token Object Read & Write");
  const del = await fetch(sign("DELETE"), { method: "DELETE" });
  del.ok || del.status === 204 ? ok("delete works (test file removed)") : bad(`delete refused (HTTP ${del.status})`, "give the token Object Read & Write");
}

console.log(`3. CORS for ${origin}`);
const pre = await fetch(sign("PUT", headers), {
  method: "OPTIONS",
  headers: { Origin: origin, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type,cache-control" },
}).catch(() => null);
const allowOrigin = pre?.headers.get("access-control-allow-origin");
const allowHeaders = (pre?.headers.get("access-control-allow-headers") ?? "").toLowerCase();
if (!pre || !pre.ok || !allowOrigin) {
  bad(
    `the bucket doesn't allow uploads from ${origin}`,
    `in Cloudflare → R2 → ${c.R2_BUCKET} → Settings → CORS policy, add "${origin}" to AllowedOrigins (exact, no trailing slash), with PUT, GET, HEAD and headers Content-Type, Cache-Control`
  );
} else if (allowOrigin !== "*" && allowOrigin !== origin) {
  bad(`CORS allows ${allowOrigin}, not ${origin}`, `add "${origin}" to AllowedOrigins`);
} else if (allowHeaders && allowHeaders !== "*" && !(allowHeaders.includes("content-type") && allowHeaders.includes("cache-control"))) {
  bad(`CORS doesn't allow the upload headers (has: ${allowHeaders})`, `set AllowedHeaders to ["Content-Type", "Cache-Control"]`);
} else ok("browsers on this address can upload");

console.log(problems ? `\n${problems} problem(s) found.` : "\nAll good: R2 is ready for this address.");
process.exitCode = problems ? 1 : 0;
