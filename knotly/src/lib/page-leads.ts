// src/lib/page-leads.ts — leads from the "Talk to {agent name}" chat on a vendor's public page:
// the vendor's list, status changes (spam gives the fee back), and the notification email.
import { z } from "zod";
import { fail, ok, parseInput, type Sb } from "@/lib/actions/result";

export type PageLead = {
  id: string;
  status: "locked" | "flagged" | "new" | "contacted" | "converted" | "spam";
  created_at: string;
  wedding_date: string | null;
  need: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  fee_cents: number | null;
  charged_at: string | null;
  thread_id: string | null;
  couple_signed_up: boolean;
};

/** The vendor's page leads, newest first. Contact details are null while a lead is locked. */
export async function listPageLeads(sb: Sb) {
  const { data, error } = await sb.rpc("vendor_page_leads", { p_limit: 50 });
  if (error) return fail(error.message);
  return ok((data ?? []) as PageLead[]);
}

export async function pageLeadTranscript(sb: Sb, leadId: string) {
  if (!z.uuid().safeParse(leadId).success) return fail("Lead not found.");
  const { data, error } = await sb.rpc("vendor_page_lead_transcript", { p_lead: leadId });
  if (error) return fail(error.message);
  return ok((data ?? []) as { role: "visitor" | "assistant"; body: string; created_at: string }[]);
}

export const SetPageLeadStatusInput = z.object({
  id: z.uuid("Lead not found."),
  status: z.enum(["new", "contacted", "converted", "spam"]),
});
export type SetPageLeadStatusInput = z.input<typeof SetPageLeadStatusInput>;

/** Contacted / Converted / Spam. Returns how many cents came back (spam within 14 days). */
export async function setPageLeadStatus(sb: Sb, _userId: string, input: unknown) {
  const p = parseInput(SetPageLeadStatusInput, input);
  if (!p.ok) return p;
  const { data, error } = await sb.rpc("set_page_lead_status", { p_lead: p.data.id, p_status: p.data.status });
  if (error) {
    if (/reload/i.test(error.message)) return fail("Reload your balance to see this lead first.");
    if (/not found/i.test(error.message)) return fail("Lead not found.");
    return fail(error.message);
  }
  return ok({ status: p.data.status, creditedCents: typeof data === "number" ? data : 0 });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** "New lead from your page: Priya, Jun 14 2027, …". Contact details stay in the dashboard. */
export function leadEmail(o: {
  businessName: string;
  firstName: string;
  weddingDate: string | null;
  need: string;
  locked: boolean;
  link: string;
}) {
  const date = o.weddingDate
    ? new Date(`${o.weddingDate}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : "date not set";
  const need = o.need.length > 300 ? `${o.need.slice(0, 299)}…` : o.need;
  const action = o.locked
    ? "Your balance is under the lead fee, so their contact details are locked. Reload to see them."
    : "Their contact details are in your dashboard.";
  const subject = `New lead from your Knotly page: ${o.firstName}, ${date}`;
  const text = `${o.businessName}, a couple left their details on your Knotly page.\n\n${o.firstName} · ${date}\n"${need}"\n\n${action}\n${o.link}`;
  const html = `<p>${esc(o.businessName)}, a couple left their details on your Knotly page.</p>
<p><strong>${esc(o.firstName)}</strong> · ${esc(date)}<br>&ldquo;${esc(need)}&rdquo;</p>
<p>${esc(action)}</p>
<p><a href="${esc(o.link)}">${o.locked ? "Reload and see the lead" : "See the lead"}</a></p>`;
  return { subject, text, html };
}
