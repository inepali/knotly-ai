import { describe, expect, it } from "vitest";
import { leadEmail, pageLeadTranscript, setPageLeadStatus } from "./page-leads";
import { UUID, mockSb } from "./actions/test-utils";

describe("setPageLeadStatus", () => {
  it("validates before calling the database", async () => {
    const { sb, calls } = mockSb();
    expect((await setPageLeadStatus(sb, "v1", { id: "nope", status: "spam" })).ok).toBe(false);
    expect((await setPageLeadStatus(sb, "v1", { id: UUID, status: "locked" })).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("returns the credit from a spam mark", async () => {
    const { sb, calls } = mockSb({}, { data: 100 });
    expect(await setPageLeadStatus(sb, "v1", { id: UUID, status: "spam" })).toEqual({
      ok: true,
      data: { status: "spam", creditedCents: 100 },
    });
    expect(calls[0]).toMatchObject({ table: "rpc:set_page_lead_status", args: [{ p_lead: UUID, p_status: "spam" }] });
  });

  it("explains a locked lead", async () => {
    const { sb } = mockSb({}, { error: { message: "reload to see this lead first" } });
    expect(await setPageLeadStatus(sb, "v1", { id: UUID, status: "contacted" })).toEqual({
      ok: false,
      error: "Reload your balance to see this lead first.",
    });
  });
});

describe("pageLeadTranscript", () => {
  it("refuses a malformed id", async () => {
    expect((await pageLeadTranscript(mockSb().sb, "x")).ok).toBe(false);
  });
});

describe("leadEmail", () => {
  const base = { businessName: "Big Day Story", firstName: "Priya", weddingDate: "2027-06-14", need: "Photos <b>please</b>", link: "https://knotly.net/x" };
  it("says the details are locked when the wallet is short", () => {
    const e = leadEmail({ ...base, locked: true });
    expect(e.subject).toBe("New lead from your Knotly page: Priya, Jun 14, 2027");
    expect(e.text).toContain("locked");
    expect(e.html).toContain("&lt;b&gt;please");
  });
  it("never includes contact details", () => {
    const e = leadEmail({ ...base, locked: false });
    expect(e.text).not.toMatch(/@|\+1/);
  });
});
