// src/app/api/public-chat/[vendorId]/lead/route.ts — the contact card in the public-page chat.
// Saves the lead, charges the vendor's lead fee (or locks it until they reload), emails the vendor,
// and, for signed-in couples, moves the chat into Messages right away.
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { takeHelpQuota } from "@/lib/help-limit";
import { sendOneEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site";
import { loadChatVendor } from "@/lib/public-chat-vendor";
import { findChatSession, hashIp } from "@/lib/public-chat-session";
import { LEAD_IP_VENDOR_LIMIT, LEAD_SUBMIT_LIMIT, LeadInput, consentText } from "@/lib/public-chat";
import { leadEmail } from "@/lib/page-leads";

type Ctx = { params: Promise<{ vendorId: string }> };
const fail = (error: string, status = 400) => Response.json({ ok: false, error }, { status });

export async function POST(req: Request, { params }: Ctx) {
  const { vendorId } = await params;
  const vendor = await loadChatVendor(vendorId);
  if (!vendor) return fail("This vendor isn't taking messages here right now.", 404);

  const parsed = LeadInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the form.");
  const lead = parsed.data;
  // Honeypot filled: pretend it worked so bots learn nothing.
  if (lead.website) return Response.json({ ok: true, status: "new" });

  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  const userId = user && !user.is_anonymous ? user.id : null;

  const session = await findChatSession(vendorId, userId);
  if (!session) return fail("Your chat expired. Please reopen it and try again.", 409);

  const ip = hashIp(req.headers.get("x-forwarded-for"));
  if (!(await takeHelpQuota(`lead:${vendorId}:${ip}`, LEAD_SUBMIT_LIMIT)))
    return fail("You've already sent your details today. The vendor will be in touch.", 429);
  // Many vendors from one address in a day looks automated: still delivered, but free and marked unverified.
  const flagged = !(await takeHelpQuota(`lead-ip:${ip}`, LEAD_IP_VENDOR_LIMIT));

  const { data, error } = await supabaseAdmin.rpc("submit_page_lead", {
    p_session: session.id,
    p_name: lead.name,
    p_email: lead.email,
    p_phone: lead.phone,
    p_wedding_date: lead.weddingDate ?? null,
    p_need: lead.need,
    p_wants_more: lead.wantsMoreEstimates,
    p_consent: consentText(vendor.businessName),
    p_flagged: flagged,
    p_couple: userId,
  });
  const row = (Array.isArray(data) ? data[0] : data) as { lead_id: string; lead_status: string; duplicate: boolean } | null;
  if (error || !row) {
    console.error("[public-chat] lead", error?.message);
    return fail("Couldn't send your details. Please try again.", 500);
  }

  if (!row.duplicate && vendor.email) {
    const e = leadEmail({
      businessName: vendor.businessName,
      firstName: lead.name.split(" ")[0],
      weddingDate: lead.weddingDate ?? null,
      need: lead.need,
      locked: row.lead_status === "locked",
      link: `${siteUrl()}/vendor/dashboard/needs-you#page-leads`,
    });
    const sent = await sendOneEmail({ to: vendor.email, ...e });
    if (sent.error) console.error("[public-chat] lead email", sent.error);
  }

  // Signed-in couples don't need the signup step: the chat goes to Messages now.
  let threadId: string | null = null;
  if (userId) {
    const { data: t, error: claimError } = await supabaseAdmin.rpc("claim_vendor_chat", { p_session: session.id, p_user: userId });
    if (claimError) console.error("[public-chat] claim", claimError.message);
    threadId = (t as string | null) ?? null;
  }
  return Response.json({ ok: true, duplicate: row.duplicate, threadId });
}
