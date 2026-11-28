import { describe, it, expect, vi } from "vitest";
import { banSpamCouple, loadSpamQueue, reportSpamLead, resolveSpamReport } from "./spam";
import { mockSb, UUID } from "./test-utils";

type Send = (to: string, subject: string, text: string, link: string) => Promise<unknown>;
const sender = () => vi.fn<Send>(async () => ({}));

describe("reportSpamLead", () => {
  it("reports through the database function", async () => {
    const { sb, called } = mockSb({}, { data: "r1" });
    const r = await reportSpamLead(sb, "v1", { quoteId: UUID, reason: "fake_couple", details: " fake phone " });
    expect(r).toEqual({ ok: true, data: { reportId: "r1" } });
    expect(called("rpc:report_spam_lead", "rpc")[0].args[0]).toEqual({ p_quote: UUID, p_reason: "fake_couple", p_details: "fake phone" });
  });

  it("rejects a bad reason or estimate id", async () => {
    const { sb } = mockSb();
    expect((await reportSpamLead(sb, "v1", { quoteId: UUID, reason: "meh" })).ok).toBe(false);
    expect((await reportSpamLead(sb, "v1", { quoteId: "nope", reason: "other" })).ok).toBe(false);
  });

  it("passes the database's vendor-facing reasons through, and hides the rest", async () => {
    const late = mockSb({}, { error: { message: "this lead can no longer be reported" } });
    expect(await reportSpamLead(late.sb, "v1", { quoteId: UUID, reason: "other" })).toEqual({ ok: false, error: "This lead can no longer be reported." });
    const odd = mockSb({}, { error: { message: "relation x does not exist" } });
    expect(await reportSpamLead(odd.sb, "v1", { quoteId: UUID, reason: "other" })).toEqual({ ok: false, error: "We couldn't send your report. Please try again." });
  });
});

describe("resolveSpamReport", () => {
  it("approving credits the lead and emails the vendor", async () => {
    const send = sender();
    const { sb, called } = mockSb(
      { lead_spam_reports: { data: { vendor_id: "v1" } }, profiles: { data: [{ id: "v1", email: "v@b.co" }] } },
      { data: 100 }
    );
    const r = await resolveSpamReport(sb, "admin1", { reportId: UUID, approve: true }, { send });
    expect(r).toEqual({ ok: true, data: { creditedCents: 100 } });
    expect(called("rpc:resolve_spam_report", "rpc")[0].args[0]).toEqual({ p_report: UUID, p_approve: true, p_admin: "admin1" });
    expect(send).toHaveBeenCalledWith("v@b.co", "A spam lead was credited back", expect.stringMatching(/\$1 has been returned/), expect.any(String));
  });

  it("rejecting emails nobody", async () => {
    const send = sender();
    const { sb } = mockSb({ lead_spam_reports: { data: { vendor_id: "v1" } } }, { data: 0 });
    expect(await resolveSpamReport(sb, "admin1", { reportId: UUID, approve: false }, { send })).toEqual({ ok: true, data: { creditedCents: 0 } });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("banSpamCouple", () => {
  it("bans, credits each vendor, and emails them", async () => {
    const send = sender();
    const ban = vi.fn<(id: string) => Promise<{ error: { message: string } | null }>>(async () => ({ error: null }));
    const { sb, called } = mockSb(
      {
        profiles: [{ data: { role: "couple" } }, { data: [{ id: "v1", email: "a@v.co" }, { id: "v2", email: "b@v.co" }] }],
        quotes: { data: [{ id: "q1" }, { id: "q2" }] },
        wallet_transactions: { data: [{ vendor_id: "v1" }, { vendor_id: "v2" }, { vendor_id: "v1" }] },
      },
      { data: 3 }
    );
    const r = await banSpamCouple(sb, "admin1", { coupleId: UUID }, { send, ban });
    expect(r).toEqual({ ok: true, data: { leadsCredited: 3, vendorsEmailed: 2 } });
    expect(ban).toHaveBeenCalledWith(UUID);
    expect(called("rpc:credit_spam_couple", "rpc")[0].args[0]).toEqual({ p_couple: UUID, p_admin: "admin1" });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("only bans couples", async () => {
    const ban = vi.fn<(id: string) => Promise<{ error: { message: string } | null }>>(async () => ({ error: null }));
    const { sb } = mockSb({ profiles: { data: { role: "vendor" } } });
    expect(await banSpamCouple(sb, "admin1", { coupleId: UUID }, { send: sender(), ban })).toEqual({ ok: false, error: "That account isn't a couple." });
    expect(ban).not.toHaveBeenCalled();
  });

  it("stops if the ban fails, before crediting anyone", async () => {
    const { sb, called } = mockSb({ profiles: { data: { role: "couple" } } });
    const r = await banSpamCouple(sb, "admin1", { coupleId: UUID }, { send: sender(), ban: async () => ({ error: { message: "auth down" } }) });
    expect(r).toEqual({ ok: false, error: "auth down" });
    expect(called("rpc:credit_spam_couple", "rpc")).toHaveLength(0);
  });
});

describe("loadSpamQueue", () => {
  it("flattens who's involved", async () => {
    const { sb } = mockSb({
      lead_spam_reports: {
        data: [
          {
            id: "r1",
            reason: "fake_couple",
            details: null,
            created_at: "2026-11-27T10:00:00Z",
            vendors: { business_name: "Golden Hour" },
            quotes: { thread_id: "t1", threads: { couple_projects: { couple_id: "c1", partner_names: "Priya & Sam", wedding_date: "2027-10-16" } } },
          },
        ],
      },
    });
    expect(await loadSpamQueue(sb)).toEqual([
      {
        id: "r1",
        reason: "fake_couple",
        details: null,
        created_at: "2026-11-27T10:00:00Z",
        vendor: "Golden Hour",
        couple: { id: "c1", names: "Priya & Sam", weddingDate: "2027-10-16" },
        threadId: "t1",
      },
    ]);
  });
});
