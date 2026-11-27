import { describe, expect, it } from "vitest";
import { mockSb, UUID } from "./test-utils";
import { listConnectedClients, sendReviewRequest, submitClientReview, submitEmailReview } from "./review-requests";
import { hashReviewToken, newReviewToken } from "@/lib/review-tokens";
import { requestState, reviewBadge, reviewRequestEmail } from "@/lib/review-requests";

const V = "v1";
const P = "223e4567-e89b-42d3-a456-426614174000";
const future = new Date(Date.now() + 86400e3).toISOString();

function deps(o: { email?: string | null; sendError?: string } = {}) {
  const sent: { to: string; subject: string; text: string; html: string }[] = [];
  const admin = mockSb({ profiles: { data: { email: o.email === undefined ? "couple@example.com" : o.email, full_name: "Priya" } } }).sb;
  return { sent, deps: { admin, siteUrl: "https://knotly.net", send: async (e: (typeof sent)[0]) => (sent.push(e), o.sendError ? { error: o.sendError } : {}) } };
}

describe("sendReviewRequest by email", () => {
  it("stores only a hash of the token and emails the one-time link", async () => {
    const { sb, called } = mockSb({ vendors: { data: { business_name: "Golden Hour" } }, review_requests: [{ count: 0 }, { data: [] }, { data: { id: "r1" } }] });
    const d = deps();
    const r = await sendReviewRequest(sb, V, { to: "email", name: "Kayla M.", email: "Kayla@Example.com", note: "Loved your day!" }, d.deps);
    expect(r).toEqual({ ok: true, data: { id: "r1", emailed: true } });
    const row = called("review_requests", "insert")[0].args[0] as Record<string, string>;
    expect(row).toMatchObject({ vendor_id: V, recipient_name: "Kayla M.", recipient_email: "kayla@example.com", note: "Loved your day!" });
    const token = d.sent[0].text.match(/\/review\/([A-Za-z0-9_-]{43})/)![1];
    expect(row.token_hash).toBe(hashReviewToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(d.sent[0]).toMatchObject({ to: "kayla@example.com", subject: "Golden Hour would love your review" });
  });

  it("stops at the daily limit", async () => {
    const { sb, called } = mockSb({ vendors: { data: { business_name: "G" } }, review_requests: { count: 20 } });
    const r = await sendReviewRequest(sb, V, { to: "email", name: "K", email: "k@x.co" }, deps().deps);
    expect(r.ok).toBe(false);
    expect(called("review_requests", "insert")).toEqual([]);
  });

  it("won't ask someone who already reviewed, or ask twice while one is open", async () => {
    const done = mockSb({ vendors: { data: { business_name: "G" } }, review_requests: [{ count: 0 }, { data: [{ id: "old" }] }] });
    expect(await sendReviewRequest(done.sb, V, { to: "email", name: "K", email: "k@x.co" }, deps().deps)).toEqual({ ok: false, error: "K has already left you a review." });
    const dup = mockSb({ vendors: { data: { business_name: "G" } }, review_requests: [{ count: 0 }, { data: [] }, { error: { message: "duplicate key value violates unique constraint" } }] });
    const r = await sendReviewRequest(dup.sb, V, { to: "email", name: "K", email: "k@x.co" }, deps().deps);
    expect(r.ok === false && r.error).toMatch(/already asked K/);
  });

  it("withdraws the request if the email can't be sent", async () => {
    const { sb, called } = mockSb({ vendors: { data: { business_name: "G" } }, review_requests: [{ count: 0 }, { data: [] }, { data: { id: "r1" } }] });
    const r = await sendReviewRequest(sb, V, { to: "email", name: "K", email: "k@x.co" }, deps({ sendError: "bounced" }).deps);
    expect(r.ok).toBe(false);
    expect(called("review_requests", "update")[0].args[0]).toEqual({ status: "canceled" });
  });

  it("rejects a bad email address", async () => {
    expect((await sendReviewRequest(mockSb().sb, V, { to: "email", name: "K", email: "nope" }, deps().deps)).ok).toBe(false);
  });
});

describe("sendReviewRequest to a Knotly couple", () => {
  it("asks a couple the vendor has talked to, and points them to their dashboard", async () => {
    const { sb, called } = mockSb({
      vendors: { data: { business_name: "Golden Hour" } },
      threads: { data: { couple_projects: { id: P, couple_id: UUID, partner_names: "Priya & Sam" } } },
      review_requests: [{ count: 0 }, { data: [] }, { data: { id: "r2" } }],
    });
    const d = deps();
    const r = await sendReviewRequest(sb, V, { to: "client", projectId: P }, d.deps);
    expect(r.ok).toBe(true);
    expect(called("review_requests", "insert")[0].args[0]).toMatchObject({ couple_id: UUID, project_id: P, recipient_name: "Priya & Sam" });
    expect(d.sent[0].text).toContain("https://knotly.net/client/dashboard/reviews");
  });

  it("refuses couples they haven't talked to", async () => {
    const { sb } = mockSb({ vendors: { data: { business_name: "G" } }, threads: { data: null }, review_requests: { count: 0 } });
    expect(await sendReviewRequest(sb, V, { to: "client", projectId: P }, deps().deps)).toEqual({ ok: false, error: "You can only ask couples you've talked to on Knotly." });
  });

  it("still works for phone-only couples (no email, seen in the dashboard)", async () => {
    const { sb } = mockSb({
      vendors: { data: { business_name: "G" } },
      threads: { data: { couple_projects: { id: P, couple_id: UUID, partner_names: null } } },
      review_requests: [{ count: 0 }, { data: [] }, { data: { id: "r3" } }],
    });
    const d = deps({ email: null });
    expect(await sendReviewRequest(sb, V, { to: "client", projectId: P }, d.deps)).toEqual({ ok: true, data: { id: "r3", emailed: false } });
    expect(d.sent).toEqual([]);
  });
});

describe("listConnectedClients", () => {
  it("lists each couple once", async () => {
    const proj = { id: P, partner_names: " Priya & Sam ", wedding_date: "2027-05-01" };
    const { sb } = mockSb({ threads: { data: [{ project_id: P, couple_projects: proj }, { project_id: P, couple_projects: proj }] } });
    expect(await listConnectedClients(sb, V)).toEqual([{ projectId: P, name: "Priya & Sam", weddingDate: "2027-05-01" }]);
  });
});

const open = { id: "r1", vendor_id: V, recipient_name: "Kayla", couple_id: null, status: "sent", expires_at: future };
const review = { name: "Kayla M.", rating: 5, body: "Wonderful from start to finish, highly recommend!" };

describe("submitEmailReview", () => {
  it("posts an invited (not verified) review once", async () => {
    const { token } = newReviewToken();
    const admin = mockSb({ review_requests: [{ data: open }, { data: [{ id: "r1" }] }, { data: null }], testimonials: { data: { id: "t1" } } });
    expect(await submitEmailReview(admin.sb, token, review)).toEqual({ ok: true, data: { testimonialId: "t1", vendorId: V } });
    expect(admin.called("testimonials", "insert")[0].args[0]).toMatchObject({ vendor_id: V, rating: 5, verified: false, source: "email_request" });
  });

  it("refuses a used or expired link", async () => {
    const { token } = newReviewToken();
    const admin = mockSb({ review_requests: [{ data: open }, { data: [] }] });
    expect(await submitEmailReview(admin.sb, token, review)).toEqual({ ok: false, error: "This review link has already been used or has expired." });
    expect(admin.called("testimonials", "insert")).toEqual([]);
  });

  it("refuses odd tokens, short reviews and couple requests", async () => {
    expect((await submitEmailReview(mockSb().sb, "short", review)).ok).toBe(false);
    expect((await submitEmailReview(mockSb().sb, newReviewToken().token, { ...review, body: "ok" })).ok).toBe(false);
    const admin = mockSb({ review_requests: { data: { ...open, couple_id: UUID } } });
    expect((await submitEmailReview(admin.sb, newReviewToken().token, review)).ok).toBe(false);
  });

  it("frees the request again if the review can't be saved", async () => {
    const admin = mockSb({ review_requests: [{ data: open }, { data: [{ id: "r1" }] }, { data: null }], testimonials: { error: { message: "boom" } } });
    expect((await submitEmailReview(admin.sb, newReviewToken().token, review)).ok).toBe(false);
    expect(admin.called("review_requests", "update").map((c) => c.args[0])).toContainEqual({ status: "sent", completed_at: null });
  });
});

describe("submitClientReview", () => {
  it("posts a verified review for the signed-in couple", async () => {
    const sb = mockSb({ review_requests: { data: { ...open, couple_id: UUID } } });
    const admin = mockSb({ review_requests: [{ data: [{ id: "r1" }] }, { data: null }], testimonials: { data: { id: "t2" } } });
    const r = await submitClientReview(sb.sb, admin.sb, UUID, { ...review, requestId: UUID });
    expect(r.ok).toBe(true);
    expect(admin.called("testimonials", "insert")[0].args[0]).toMatchObject({ verified: true, source: "knotly_client", couple_id: UUID });
  });
  it("refuses requests that aren't theirs", async () => {
    const sb = mockSb({ review_requests: { data: null } });
    expect((await submitClientReview(sb.sb, mockSb().sb, UUID, { ...review, requestId: UUID })).ok).toBe(false);
  });
});

describe("labels and email", () => {
  it("labels each review by where it came from", () => {
    expect(reviewBadge({ verified: true, source: "knotly_client" })).toBe("Verified Knotly client");
    expect(reviewBadge({ verified: false, source: "email_request" })).toBe("Invited review");
    expect(reviewBadge({ verified: false, source: "vendor" })).toBe("Added by vendor");
  });
  it("knows when a request is closed", () => {
    expect(requestState({ status: "sent", expires_at: future })).toBe("open");
    expect(requestState({ status: "sent", expires_at: "2020-01-01T00:00:00Z" })).toBe("expired");
    expect(requestState({ status: "completed", expires_at: future })).toBe("completed");
  });
  it("escapes what vendors type into the email", () => {
    const m = reviewRequestEmail({ vendorName: "<b>Evil</b>", clientName: "K", note: "<script>x</script>", link: "https://knotly.net/review/abc", inKnotly: false });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;b&gt;Evil&lt;/b&gt;");
  });
});
