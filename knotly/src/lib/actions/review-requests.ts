// src/lib/actions/review-requests.ts — vendors ask past clients for reviews; clients write them.
//
// Two kinds of request (see review-requests-spec.md):
//  - to an email: a one-time link to /review/{token}. The review shows as "Invited review",
//    because the vendor chose the address.
//  - to a couple the vendor has talked to on Knotly: they write it signed in, in their dashboard,
//    and it shows as "Verified Knotly client".
// Vendors read and write requests with their own client (RLS). Reviews are written with the
// service role, only after the token or the signed-in couple has been checked here.
import { fail, ok, parseInput, type Sb } from "./result";
import {
  CancelReviewRequestInput,
  REQUESTS_PER_DAY,
  REQUEST_DAYS,
  SendReviewRequestInput,
  WriteReviewInput,
  requestState,
  reviewRequestEmail,
} from "@/lib/review-requests";
import { hashReviewToken, isTokenShape, newReviewToken } from "@/lib/review-tokens";

export type ReviewEmail = { to: string; subject: string; html: string; text: string };
export type SendDeps = {
  /** Service-role client: looks up a couple's email address. */
  admin: Sb;
  send: (e: ReviewEmail) => Promise<{ error?: string }>;
  siteUrl: string;
};

export type ConnectedClient = { projectId: string; name: string; weddingDate: string | null };

/** Couples this vendor has a conversation with (the ones they can ask inside Knotly). */
export async function listConnectedClients(sb: Sb, vendorId: string): Promise<ConnectedClient[]> {
  const { data } = await sb
    .from("threads")
    .select("project_id, couple_projects(id, partner_names, wedding_date)")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false })
    .limit(200);
  const seen = new Set<string>();
  const out: ConnectedClient[] = [];
  for (const t of (data ?? []) as unknown as { project_id: string; couple_projects: { id: string; partner_names: string | null; wedding_date: string | null } | null }[]) {
    const p = t.couple_projects;
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({ projectId: p.id, name: p.partner_names?.trim() || "A couple on Knotly", weddingDate: p.wedding_date });
  }
  return out;
}

export type VendorReviewRequest = {
  id: string;
  recipient_name: string;
  recipient_email: string | null;
  couple_id: string | null;
  status: string;
  created_at: string;
  expires_at: string;
};

export async function listReviewRequests(sb: Sb, vendorId: string): Promise<VendorReviewRequest[]> {
  const { data } = await sb
    .from("review_requests")
    .select("id, recipient_name, recipient_email, couple_id, status, created_at, expires_at")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as VendorReviewRequest[];
}

export async function sendReviewRequest(sb: Sb, vendorId: string, input: unknown, deps: SendDeps) {
  const p = parseInput(SendReviewRequestInput, input);
  if (!p.ok) return p;
  const req = p.data;

  const { data: vendor } = await sb.from("vendors").select("business_name").eq("id", vendorId).maybeSingle();
  if (!vendor) return fail("Set up your business profile first.");

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await sb
    .from("review_requests")
    .select("id", { count: "exact", head: true })
    .eq("vendor_id", vendorId)
    .gte("created_at", since);
  if ((count ?? 0) >= REQUESTS_PER_DAY) return fail(`You can send up to ${REQUESTS_PER_DAY} review requests a day. Try again tomorrow.`);

  let row: Record<string, unknown>;
  let to: string | null;
  let link: string;
  let name: string;
  if (req.to === "email") {
    const { data: done } = await sb
      .from("review_requests")
      .select("id")
      .eq("vendor_id", vendorId)
      .eq("status", "completed")
      .ilike("recipient_email", req.email)
      .limit(1);
    if (done?.length) return fail(`${req.name} has already left you a review.`);
    const t = newReviewToken();
    name = req.name;
    to = req.email;
    link = `${deps.siteUrl}/review/${t.token}`;
    row = { vendor_id: vendorId, recipient_name: req.name, recipient_email: req.email, token_hash: t.hash, note: req.note || null };
  } else {
    // RLS on the insert also requires a conversation with this couple; this finds who they are.
    const { data: thread } = await sb
      .from("threads")
      .select("couple_projects(id, couple_id, partner_names)")
      .eq("vendor_id", vendorId)
      .eq("project_id", req.projectId)
      .limit(1)
      .maybeSingle();
    const proj = (thread as unknown as { couple_projects: { id: string; couple_id: string; partner_names: string | null } | null } | null)?.couple_projects;
    if (!proj) return fail("You can only ask couples you've talked to on Knotly.");
    const { data: done } = await sb
      .from("review_requests")
      .select("id")
      .eq("vendor_id", vendorId)
      .eq("couple_id", proj.couple_id)
      .eq("status", "completed")
      .limit(1);
    if (done?.length) return fail("This couple has already left you a review.");
    const { data: prof } = await deps.admin.from("profiles").select("email, full_name").eq("id", proj.couple_id).maybeSingle();
    name = proj.partner_names?.trim() || prof?.full_name || "there";
    to = prof?.email ?? null; // phone-only accounts still see it in their dashboard
    link = `${deps.siteUrl}/client/dashboard/reviews`;
    row = { vendor_id: vendorId, recipient_name: name.slice(0, 80), couple_id: proj.couple_id, project_id: proj.id, note: req.note || null };
  }

  const { data: created, error } = await sb.from("review_requests").insert(row).select("id").single();
  if (error) {
    if (error.code === "23505" || /duplicate|unique/i.test(error.message)) return fail(`You've already asked ${name}. They have ${REQUEST_DAYS} days to reply.`);
    return fail(error.message);
  }

  if (to) {
    const mail = reviewRequestEmail({ vendorName: vendor.business_name, clientName: name, note: req.note, link, inKnotly: req.to === "client" });
    const sent = await deps.send({ to, ...mail });
    if (sent.error) {
      await sb.from("review_requests").update({ status: "canceled" }).eq("id", created.id);
      return fail("We couldn't send the email. Please check the address and try again.");
    }
  }
  return ok({ id: created.id, emailed: !!to });
}

export async function cancelReviewRequest(sb: Sb, vendorId: string, input: unknown) {
  const p = parseInput(CancelReviewRequestInput, input);
  if (!p.ok) return p;
  const { data, error } = await sb
    .from("review_requests")
    .update({ status: "canceled" })
    .eq("id", p.data.id)
    .eq("vendor_id", vendorId)
    .eq("status", "sent")
    .select("id");
  if (error) return fail(error.message);
  if (!data?.length) return fail("That request can't be canceled anymore.");
  return ok({ canceled: p.data.id });
}

// ---- Writing the review --------------------------------------------------------------------

type OpenRequest = { id: string; vendor_id: string; recipient_name: string; couple_id: string | null; status: string; expires_at: string };
const REQUEST_COLS = "id, vendor_id, recipient_name, couple_id, status, expires_at";

/** Claim the request, add the review, link them. Only one submission can ever win the claim. */
async function complete(admin: Sb, r: OpenRequest, review: WriteReviewInput & { name: string }, from: "email_request" | "knotly_client") {
  const now = new Date().toISOString();
  const { data: claimed } = await admin
    .from("review_requests")
    .update({ status: "completed", completed_at: now })
    .eq("id", r.id)
    .eq("status", "sent")
    .gt("expires_at", now)
    .select("id");
  if (!claimed?.length) return fail("This review link has already been used or has expired.");
  const { data: t, error } = await admin
    .from("testimonials")
    .insert({
      vendor_id: r.vendor_id,
      author_name: review.name,
      rating: review.rating,
      body: review.body,
      verified: from === "knotly_client",
      source: from,
      couple_id: r.couple_id,
    })
    .select("id")
    .single();
  if (error || !t) {
    await admin.from("review_requests").update({ status: "sent", completed_at: null }).eq("id", r.id);
    return fail("We couldn't save your review. Please try again.");
  }
  await admin.from("review_requests").update({ testimonial_id: t.id }).eq("id", r.id);
  return ok({ testimonialId: t.id as string, vendorId: r.vendor_id });
}

export type TokenView =
  | { state: "invalid" }
  | { state: "completed" | "canceled" | "expired"; vendorName: string }
  | { state: "open"; vendorName: string; category: string | null; clientName: string; note: string | null };

/** What the public review page shows for a token. */
export async function loadReviewByToken(admin: Sb, token: string): Promise<TokenView> {
  if (!isTokenShape(token)) return { state: "invalid" };
  const { data } = await admin
    .from("review_requests")
    .select(`${REQUEST_COLS}, note, vendors(business_name, category)`)
    .eq("token_hash", hashReviewToken(token))
    .maybeSingle();
  if (!data) return { state: "invalid" };
  const r = data as unknown as OpenRequest & { note: string | null; vendors: { business_name: string; category: string | null } | null };
  const vendorName = r.vendors?.business_name ?? "Your vendor";
  const state = requestState(r);
  if (state !== "open") return { state, vendorName };
  return { state, vendorName, category: r.vendors?.category ?? null, clientName: r.recipient_name, note: r.note };
}

/** A review written through an emailed link. */
export async function submitEmailReview(admin: Sb, token: string, input: unknown) {
  const p = parseInput(WriteReviewInput, input);
  if (!p.ok) return p;
  if (!isTokenShape(token)) return fail("This review link isn't valid.");
  const { data } = await admin.from("review_requests").select(REQUEST_COLS).eq("token_hash", hashReviewToken(token)).maybeSingle();
  if (!data || (data as OpenRequest).couple_id) return fail("This review link isn't valid.");
  return complete(admin, data as OpenRequest, p.data, "email_request");
}

export type CoupleReviewRequest = { id: string; vendorName: string; category: string | null; note: string | null; expiresAt: string };

/** Requests waiting for this couple (RLS: only theirs). Vendor names via the service role,
 *  because a vendor who has since unpublished isn't readable by couples. */
export async function listMyReviewRequests(sb: Sb, admin: Sb, userId: string): Promise<CoupleReviewRequest[]> {
  const { data } = await sb
    .from("review_requests")
    .select("id, vendor_id, note, status, expires_at")
    .eq("couple_id", userId)
    .eq("status", "sent")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as { id: string; vendor_id: string; note: string | null; expires_at: string }[];
  if (!rows.length) return [];
  const { data: vendors } = await admin.from("vendors").select("id, business_name, category").in("id", [...new Set(rows.map((r) => r.vendor_id))]);
  type V = { id: string; business_name: string; category: string | null };
  const byId = new Map<string, V>(((vendors ?? []) as V[]).map((v) => [v.id, v]));
  return rows.map((r) => ({
    id: r.id,
    vendorName: byId.get(r.vendor_id)?.business_name ?? "Your vendor",
    category: byId.get(r.vendor_id)?.category ?? null,
    note: r.note,
    expiresAt: r.expires_at,
  }));
}

export const ClientReviewInput = WriteReviewInput.extend({ requestId: CancelReviewRequestInput.shape.id });

/** A signed-in couple writes the review a vendor asked them for. */
export async function submitClientReview(sb: Sb, admin: Sb, userId: string, input: unknown) {
  const p = parseInput(ClientReviewInput, input);
  if (!p.ok) return p;
  // Read through the couple's own client: RLS only returns requests addressed to them.
  const { data } = await sb.from("review_requests").select(REQUEST_COLS).eq("id", p.data.requestId).eq("couple_id", userId).maybeSingle();
  if (!data) return fail("That review request wasn't found.");
  const { name, rating, body } = p.data;
  return complete(admin, data as OpenRequest, { name, rating, body }, "knotly_client");
}
