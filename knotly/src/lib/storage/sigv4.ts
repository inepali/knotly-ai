// src/lib/storage/sigv4.ts — AWS Signature V4 query-string signing (presigned URLs), which
// Cloudflare R2 speaks through its S3-compatible API. No SDK needed: one HMAC chain.
import { createHash, createHmac } from "node:crypto";

export type PresignInput = {
  method: "GET" | "PUT" | "HEAD" | "DELETE";
  /** e.g. "<account>.r2.cloudflarestorage.com" */
  host: string;
  /** "/{bucket}/{key}" (path-style). Each segment is encoded here. */
  path: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string; // R2: "auto"
  service?: string; // "s3"
  expiresIn: number; // seconds, 1..604800
  /** Extra headers the request must send exactly (e.g. content-type, content-length). host is always signed. */
  headers?: Record<string, string>;
  now?: Date;
};

const hex = (b: Buffer) => b.toString("hex");
const sha256 = (s: string) => hex(createHash("sha256").update(s, "utf8").digest());
const hmac = (key: Buffer | string, s: string) => createHmac("sha256", key).update(s, "utf8").digest();

/** RFC 3986 encoding as AWS expects (keeps A-Z a-z 0-9 - _ . ~). */
export const awsEncode = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function amzDate(d: Date) {
  const iso = d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return { stamp: iso, day: iso.slice(0, 8) }; // 20130524T000000Z, 20130524
}

/** A presigned URL. The caller must send exactly the signed headers. */
export function presignUrl(p: PresignInput): string {
  const region = p.region ?? "auto";
  const service = p.service ?? "s3";
  if (!(p.expiresIn >= 1 && p.expiresIn <= 604800)) throw new Error("expiresIn must be 1..604800 seconds");
  const { stamp, day } = amzDate(p.now ?? new Date());
  const scope = `${day}/${region}/${service}/aws4_request`;

  const headers: Record<string, string> = { host: p.host };
  for (const [k, v] of Object.entries(p.headers ?? {})) headers[k.toLowerCase()] = String(v).trim();
  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(";");

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${p.accessKeyId}/${scope}`,
    "X-Amz-Date": stamp,
    "X-Amz-Expires": String(Math.floor(p.expiresIn)),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${awsEncode(k)}=${awsEncode(query[k])}`)
    .join("&");
  const canonicalPath = p.path.split("/").map(awsEncode).join("/");
  const canonicalRequest = [
    p.method,
    canonicalPath,
    canonicalQuery,
    names.map((n) => `${n}:${headers[n]}\n`).join(""),
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const toSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${p.secretAccessKey}`, day);
  const kSigning = hmac(hmac(hmac(kDate, region), service), "aws4_request");
  const signature = hex(hmac(kSigning, toSign));
  return `https://${p.host}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
