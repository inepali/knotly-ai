// src/lib/review-requests.ts — review request rules, inputs and labels (see review-requests-spec.md).
// Safe in the browser; the token helpers are in review-tokens.ts (server only).
import { z } from "zod";

export const REQUESTS_PER_DAY = 20;
export const REQUEST_DAYS = 30;
export const REVIEW_MIN = 20;
export const REVIEW_MAX = 2000;

const Note = z.string().trim().max(500, "Keep the note under 500 characters.").optional();

export const SendReviewRequestInput = z.discriminatedUnion("to", [
  z.object({
    to: z.literal("email"),
    name: z.string().trim().min(1, "Add the client's name.").max(80),
    email: z.email("Enter a valid email address.").trim().toLowerCase().max(254),
    note: Note,
  }),
  z.object({ to: z.literal("client"), projectId: z.uuid(), note: Note }),
]);
export type SendReviewRequestInput = z.input<typeof SendReviewRequestInput>;

export const CancelReviewRequestInput = z.object({ id: z.uuid() });
export type CancelReviewRequestInput = z.input<typeof CancelReviewRequestInput>;

export const WriteReviewInput = z.object({
  name: z.string().trim().min(1, "Add your name.").max(80),
  rating: z.number().int().min(1, "Pick 1 to 5 stars.").max(5, "Pick 1 to 5 stars."),
  body: z
    .string()
    .trim()
    .min(REVIEW_MIN, `Write at least ${REVIEW_MIN} characters.`)
    .max(REVIEW_MAX, `Keep it under ${REVIEW_MAX} characters.`),
});
export type WriteReviewInput = z.input<typeof WriteReviewInput>;

export type RequestState = "open" | "completed" | "canceled" | "expired";
export function requestState(r: { status: string; expires_at: string }, now = new Date()): RequestState {
  if (r.status === "completed") return "completed";
  if (r.status === "canceled") return "canceled";
  return new Date(r.expires_at) <= now ? "expired" : "open";
}

/** How a review is labelled on the vendor's public page. */
export function reviewBadge(t: { source?: string | null; verified: boolean }) {
  if (t.verified || t.source === "knotly_client") return "Verified Knotly client";
  if (t.source === "email_request") return "Invited review";
  return "Added by vendor";
}

/** The email a vendor's request sends. Plain text and HTML, every user value escaped. */
export function reviewRequestEmail(o: { vendorName: string; clientName: string; note?: string | null; link: string; inKnotly: boolean }) {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const subject = `${o.vendorName} would love your review`;
  const ask = `${o.vendorName} asked if you'd share a few words about working with them. It takes about a minute, and it helps other couples choose.`;
  const where = o.inKnotly ? "Write it in your Knotly dashboard" : "Write your review";
  const text = [`Hi ${o.clientName},`, "", ask, ...(o.note ? ["", `Their note: "${o.note}"`] : []), "", `${where}: ${o.link}`, "", o.inKnotly ? "" : `This link is just for you and works once, for ${REQUEST_DAYS} days.`]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n")
    .trim();
  const html = `<p>Hi ${esc(o.clientName)},</p><p>${esc(ask)}</p>${
    o.note ? `<blockquote style="border-left:3px solid #ddd;padding-left:12px;color:#444">${esc(o.note).replace(/\n/g, "<br>")}</blockquote>` : ""
  }<p><a href="${esc(o.link)}" style="display:inline-block;background:#06b6d4;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">${where}</a></p>${
    o.inKnotly ? "" : `<p style="color:#888;font-size:12px">This link is just for you and works once, for ${REQUEST_DAYS} days.</p>`
  }<p style="color:#888;font-size:12px">Sent by Knotly on behalf of ${esc(o.vendorName)}.</p>`;
  return { subject, text, html };
}
