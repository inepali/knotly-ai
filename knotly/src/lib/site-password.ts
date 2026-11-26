// src/lib/site-password.ts — optional password on a wedding website.
// scrypt for the stored hash; the "unlocked" cookie is an HMAC keyed by that hash, so it can't be
// forged without the (server-only) hash and stops working when the couple changes the password.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashSitePassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export function checkSitePassword(password: string, stored: string | null | undefined): boolean {
  const [alg, salt, key] = (stored ?? "").split("$");
  if (alg !== "scrypt" || !salt || !key) return false;
  const want = Buffer.from(key, "base64url");
  const got = scryptSync(password, Buffer.from(salt, "base64url"), want.length);
  return timingSafeEqual(got, want);
}

export const unlockCookieName = (slug: string) => `ws_${slug}`;

export function unlockToken(slug: string, stored: string): string {
  return createHmac("sha256", stored).update(`site:${slug}`).digest("base64url");
}

export function isUnlocked(slug: string, stored: string | null | undefined, cookie: string | undefined): boolean {
  if (!stored) return true;
  if (!cookie) return false;
  const a = Buffer.from(unlockToken(slug, stored));
  const b = Buffer.from(cookie);
  return a.length === b.length && timingSafeEqual(a, b);
}
