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
