// src/lib/review-tokens.ts — one-time tokens for emailed review links (server only).
import { createHash, randomBytes } from "node:crypto";

/** A one-time token for the email link, and the hash we store (the token is only in the email). */
export function newReviewToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashReviewToken(token) };
}
export const hashReviewToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const isTokenShape = (t: string) => /^[A-Za-z0-9_-]{43}$/.test(t);
