// src/lib/email.ts
import "server-only";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const esc = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!)
  );

export async function sendInquiryEmail(o: {
  to: string;
  vendorName: string;
  subject: string;
  body: string;
  link: string;
}) {
  return resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to: process.env.DEV_EMAIL_TO ?? o.to, // safety net while testing
    subject: `New inquiry: ${o.subject}`,
    html: `<p>Hi ${esc(
      o.vendorName
    )},</p><p>A couple on Knotly sent you an inquiry:</p>
      <blockquote style="border-left:3px solid #ddd;padding-left:12px">${esc(
        o.body
      ).replace(/\n/g, "<br>")}</blockquote>
      <p><a href="${o.link}">Reply on Knotly</a></p>`,
  });
}
