// src/lib/invitations.ts — Save-the-Dates & Invitations: templates, the email itself, and who
// can be sent one. No database here.
import { THEMES, type ThemeKey } from "./wedding-site";

export type Kind = "save_the_date" | "invitation";
export type Template = "classic" | "modern" | "garden" | "minimal";
export const MAX_SENDS_PER_KIND = 2;
export const MAX_PER_SEND = 300; // households per click

export const KIND_LABELS: Record<Kind, string> = { save_the_date: "Save the date", invitation: "Invitation" };
export const TEMPLATES: Record<Template, { name: string; serif: boolean; border: "none" | "thin" | "double"; align: "center" | "left" }> = {
  classic: { name: "Classic", serif: true, border: "double", align: "center" },
  modern: { name: "Modern", serif: false, border: "none", align: "left" },
  garden: { name: "Garden", serif: true, border: "thin", align: "center" },
  minimal: { name: "Minimal", serif: false, border: "thin", align: "center" },
};

export type Design = { template: Template; heading: string; message: string; details: string; show_photo: boolean };

export function defaultDesign(kind: Kind): Design {
  return kind === "save_the_date"
    ? { template: "classic", heading: "Save the date", message: "We're getting married! Formal invitation to follow.", details: "", show_photo: true }
    : {
        template: "classic",
        heading: "You're invited",
        message: "Together with our families, we invite you to celebrate our wedding.",
        details: "",
        show_photo: true,
      };
}

export type CardData = {
  kind: Kind;
  design: Design;
  theme: ThemeKey;
  names: string;
  date: string; // formatted
  place: string;
  photoUrl: string | null;
  link: string;
  householdLabel?: string;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const nl = (s: string) => esc(s).replace(/\n/g, "<br>");

/** Email-safe HTML (tables + inline styles) for one household. Also used for the on-screen preview. */
export function invitationEmail(d: CardData): { subject: string; html: string; text: string } {
  const t = TEMPLATES[d.design.template] ?? TEMPLATES.classic;
  const c = THEMES[d.theme] ?? THEMES.classic;
  const font = t.serif ? "Georgia, 'Times New Roman', serif" : "Helvetica, Arial, sans-serif";
  const border = t.border === "double" ? `4px double ${c.accent}` : t.border === "thin" ? `1px solid ${c.accent}` : "none";
  const button = d.kind === "invitation" ? "RSVP" : "Visit our website";
  const subject = `${d.kind === "invitation" ? "You're invited" : "Save the date"}: ${d.names}${d.date ? `, ${d.date}` : ""}`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${c.bg};color:${c.ink};font-family:${font};border:${border};text-align:${t.align}">
${d.design.show_photo && d.photoUrl ? `<tr><td><img src="${esc(d.photoUrl)}" alt="" width="560" style="display:block;width:100%;height:auto;border:0"></td></tr>` : ""}
<tr><td style="padding:36px 32px">
${d.householdLabel ? `<p style="margin:0 0 16px;font-size:14px;opacity:.8">Dear ${esc(d.householdLabel)},</p>` : ""}
<p style="margin:0;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:${c.accent}">${esc(d.design.heading || KIND_LABELS[d.kind])}</p>
<h1 style="margin:12px 0 0;font-size:34px;font-weight:normal">${esc(d.names)}</h1>
${d.date ? `<p style="margin:12px 0 0;font-size:18px">${esc(d.date)}</p>` : ""}
${d.place ? `<p style="margin:4px 0 0;font-size:15px;opacity:.8">${esc(d.place)}</p>` : ""}
${d.design.message ? `<p style="margin:24px 0 0;font-size:16px;line-height:1.5">${nl(d.design.message)}</p>` : ""}
${d.design.details ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.5;opacity:.85">${nl(d.design.details)}</p>` : ""}
<p style="margin:28px 0 0"><a href="${esc(d.link)}" style="display:inline-block;padding:12px 28px;background:${c.accent};color:${c.bg};text-decoration:none;border-radius:999px;font-family:Helvetica,Arial,sans-serif;font-weight:bold">${button}</a></p>
</td></tr></table>
<p style="font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#999">Sent with Knotly for ${esc(d.names)}.</p>
</td></tr></table></body></html>`;
  const text = [d.design.heading || KIND_LABELS[d.kind], d.names, d.date, d.place, "", d.design.message, d.design.details, "", `${button}: ${d.link}`]
    .filter((x, i, a) => x || a[i - 1])
    .join("\n");
  return { subject, html, text };
}

export type Recipient = { householdId: string; label: string; emails: string[]; sent: number; lastSent: string | null };

/** Households that can get this kind now: have an email and fewer than 2 sends. */
export function sendable(recipients: Recipient[], selected: string[]): Recipient[] {
  const want = new Set(selected);
  return recipients.filter((r) => want.has(r.householdId) && r.emails.length > 0 && r.sent < MAX_SENDS_PER_KIND);
}

export const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
