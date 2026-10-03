// src/lib/email.ts
import "server-only";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const esc = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!)
  );

// Notification for a new message in a Knotly conversation (either direction).
// The message itself lives in the Knotly inbox; this email just points there.
export async function sendMessageEmail(o: {
  to: string;
  recipientName: string;
  intro: string; // e.g. "A couple on Knotly sent you an inquiry:"
  subject: string;
  body: string;
  link: string;
}) {
  return resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to: process.env.DEV_EMAIL_TO ?? o.to, // safety net while testing
    subject: o.subject,
    html: `<p>Hi ${esc(o.recipientName)},</p><p>${esc(o.intro)}</p>
      <blockquote style="border-left:3px solid #ddd;padding-left:12px">${esc(
        o.body
      ).replace(/\n/g, "<br>")}</blockquote>
      <p><a href="${o.link}">Open in your Knotly inbox</a></p>`,
  });
}

export async function notify(
  to: string,
  subject: string,
  text: string,
  link: string
) {
  return resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to: process.env.DEV_EMAIL_TO ?? to,
    subject,
    html: `<p>${esc(text)}</p><p><a href="${link}">Open Knotly</a></p>`,
  });
}

export function sendInquiryEmail(o: {
  to: string;
  vendorName: string;
  subject: string;
  body: string;
  link: string;
}) {
  return sendMessageEmail({
    to: o.to,
    recipientName: o.vendorName,
    intro: "A couple on Knotly sent you an inquiry:",
    subject: `New inquiry: ${o.subject}`,
    body: o.body,
    link: o.link,
  });
}

// Copy of an agent draft for the human vendor to review. Nothing has been sent to the
// couple; the vendor approves (or edits) it in Knotly and only then does it go out.
export async function sendDraftReviewEmail(o: {
  to: string;
  vendorName: string;
  coupleName: string;
  kind: string; // decision.responseType, e.g. "quote"
  subject: string;
  body: string;
  warnings: string[];
  link: string;
}) {
  const warnings = o.warnings.length
    ? `<p style="background:#fef3c7;padding:8px 12px;border-radius:6px"><strong>Check before approving:</strong><br>${o.warnings
        .map(esc)
        .join("<br>")}</p>`
    : "";
  return resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to: process.env.DEV_EMAIL_TO ?? o.to, // safety net while testing
    subject: `Review needed: ${o.kind === "quote" ? "estimate" : "reply"} to ${
      o.coupleName
    }`,
    html: `<p>Hi ${esc(o.vendorName)},</p>
      <p>Your Knotly assistant drafted this ${
        o.kind === "quote" ? "estimate" : "reply"
      } to <strong>${esc(
      o.coupleName
    )}</strong>. <strong>It has not been sent.</strong> Review it, edit if needed, and approve to send it.</p>
      ${warnings}
      <p style="margin:0"><strong>${esc(o.subject)}</strong></p>
      <blockquote style="border-left:3px solid #ddd;padding-left:12px;white-space:pre-wrap">${esc(
        o.body
      ).replace(/\n/g, "<br>")}</blockquote>
      <p><a href="${o.link}">Review and approve in Knotly</a></p>`,
  });
}
