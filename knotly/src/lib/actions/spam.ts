// src/lib/actions/spam.ts — spam leads (pricing-vendor-wallet-spec.md, step 7).
// Vendors report a charged lead within 14 days; admins approve (the $1 comes back) or reject.
// Banning a couple as spam credits every vendor they cost a lead. The database functions
// (report_spam_lead, resolve_spam_report, credit_spam_couple) hold the rules; this is the glue.
import { z } from "zod";
import { SPAM_REASONS } from "@/contracts/db";
import { fail, ok, parseInput, type Sb } from "./result";

export const SPAM_REASON_LABELS: Record<(typeof SPAM_REASONS)[number], string> = {
  fake_couple: "Not a real couple",
  fake_details: "Fake or wrong details",
  solicitation: "Selling something / solicitation",
  other: "Something else",
};

export const ReportSpamInput = z.object({
  quoteId: z.uuid(),
  reason: z.enum(SPAM_REASONS),
  details: z.string().trim().max(1000).optional(),
});
export type ReportSpamInput = z.input<typeof ReportSpamInput>;

// The database's own messages are written for vendors; anything else gets a generic line.
const KNOWN = [/can no longer be reported/, /already reported/, /paused for 30 days/, /not your estimate/];
const friendly = (m: string) =>
  KNOWN.some((k) => k.test(m)) ? m.charAt(0).toUpperCase() + m.slice(1) + "." : "We couldn't send your report. Please try again.";

/** Vendor: report a lead as spam. Runs as the vendor (RLS + the function's ownership check). */
export async function reportSpamLead(sb: Sb, _userId: string, input: unknown) {
  const p = parseInput(ReportSpamInput, input);
  if (!p.ok) return p;
  const { data, error } = await sb.rpc("report_spam_lead", {
    p_quote: p.data.quoteId,
    p_reason: p.data.reason,
    p_details: p.data.details || null,
  });
  if (error) return fail(friendly(error.message));
  return ok({ reportId: data as string });
}

type Send = (to: string, subject: string, text: string, link: string) => Promise<unknown>;
const accountLink = () => `${process.env.APP_URL ?? ""}/vendor/dashboard/account`;

async function emailCredited(admin: Sb, vendorIds: string[], send: Send) {
  if (!vendorIds.length) return;
  const { data } = await admin.from("profiles").select("id, email").in("id", vendorIds);
  for (const p of (data ?? []) as { id: string; email: string | null }[]) {
    if (!p.email) continue;
    try {
      await send(p.email, "A spam lead was credited back", "A lead was confirmed as spam. $1 has been returned to your Knotly balance.", accountLink());
    } catch (e) {
      console.error("[spam] credit email", p.id, e instanceof Error ? e.message : e);
    }
  }
}

export const ResolveSpamInput = z.object({ reportId: z.uuid(), approve: z.boolean() });

/** Admin: approve (credits the lead) or reject a report. `admin` is the service-role client. */
export async function resolveSpamReport(admin: Sb, adminId: string, input: unknown, deps: { send: Send }) {
  const p = parseInput(ResolveSpamInput, input);
  if (!p.ok) return p;
  const { data: report } = await admin.from("lead_spam_reports").select("vendor_id").eq("id", p.data.reportId).maybeSingle();
  const { data: cents, error } = await admin.rpc("resolve_spam_report", {
    p_report: p.data.reportId,
    p_approve: p.data.approve,
    p_admin: adminId,
  });
  if (error) return fail(error.message);
  if (p.data.approve && typeof cents === "number" && cents > 0 && report?.vendor_id)
    await emailCredited(admin, [report.vendor_id], deps.send);
  return ok({ creditedCents: typeof cents === "number" ? cents : 0 });
}

export const BanSpamCoupleInput = z.object({ coupleId: z.uuid() });

/**
 * Admin: ban a couple as spam. Signs them out for good (Supabase Auth ban), then credits every
 * vendor charged for opening their estimates, approves pending reports on them, and emails
 * each credited vendor.
 */
export async function banSpamCouple(
  admin: Sb,
  adminId: string,
  input: unknown,
  deps: { send: Send; ban: (userId: string) => Promise<{ error: { message: string } | null }> }
) {
  const p = parseInput(BanSpamCoupleInput, input);
  if (!p.ok) return p;
  const { data: profile } = await admin.from("profiles").select("role").eq("id", p.data.coupleId).maybeSingle();
  if (profile?.role !== "couple") return fail("That account isn't a couple.");

  const banned = await deps.ban(p.data.coupleId);
  if (banned.error) return fail(banned.error.message);

  const { data: count, error } = await admin.rpc("credit_spam_couple", { p_couple: p.data.coupleId, p_admin: adminId });
  if (error) return fail(error.message);

  // Who got money back: the ban's credits on this couple's estimates.
  const { data: quotes } = await admin
    .from("quotes")
    .select("id, threads!inner(couple_projects!inner(couple_id))")
    .eq("threads.couple_projects.couple_id", p.data.coupleId);
  const quoteIds = ((quotes ?? []) as { id: string }[]).map((q) => q.id);
  const { data: credits } = quoteIds.length
    ? await admin
        .from("wallet_transactions")
        .select("vendor_id")
        .eq("kind", "lead_credit")
        .eq("note", "spam couple")
        .in("quote_id", quoteIds)
    : { data: [] };
  const vendorIds = [...new Set(((credits ?? []) as { vendor_id: string }[]).map((c) => c.vendor_id))];
  await emailCredited(admin, vendorIds, deps.send);
  return ok({ leadsCredited: typeof count === "number" ? count : 0, vendorsEmailed: vendorIds.length });
}

export type SpamQueueItem = {
  id: string;
  reason: keyof typeof SPAM_REASON_LABELS;
  details: string | null;
  created_at: string;
  vendor: string;
  couple: { id: string; names: string | null; weddingDate: string | null } | null;
  threadId: string | null;
};

/** Admin: pending reports, oldest first, with who's involved. Service-role read. */
export async function loadSpamQueue(admin: Sb): Promise<SpamQueueItem[]> {
  const { data } = await admin
    .from("lead_spam_reports")
    .select(
      "id, reason, details, created_at, vendors(business_name), quotes(thread_id, threads(couple_projects(couple_id, partner_names, wedding_date)))"
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);
  type Row = {
    id: string;
    reason: SpamQueueItem["reason"];
    details: string | null;
    created_at: string;
    vendors: { business_name: string } | null;
    quotes: { thread_id: string; threads: { couple_projects: { couple_id: string; partner_names: string | null; wedding_date: string | null } | null } | null } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const cp = r.quotes?.threads?.couple_projects ?? null;
    return {
      id: r.id,
      reason: r.reason,
      details: r.details,
      created_at: r.created_at,
      vendor: r.vendors?.business_name ?? "A vendor",
      couple: cp ? { id: cp.couple_id, names: cp.partner_names, weddingDate: cp.wedding_date } : null,
      threadId: r.quotes?.thread_id ?? null,
    };
  });
}
