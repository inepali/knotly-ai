import { describe, expect, it } from "vitest";
import { mockSb } from "./actions/test-utils";
import { isExpired, loadThreadEstimates } from "./estimates";

const base = { status: "sent", valid_until: "2026-12-11", created_at: "2026-11-27T10:00:00Z" };
const lines = [{ label: "Full Story package", amount: 4800 }];

describe("loadThreadEstimates", () => {
  it("never gives a couple the price of an estimate they haven't opened", async () => {
    const { sb, called } = mockSb({ quotes: { data: [{ id: "q1", ...base, first_viewed_at: null }] } });
    const [e] = await loadThreadEstimates(sb, "couple", "t1");
    expect(e).toMatchObject({ id: "q1", opened: false, total: null, lines: null });
    expect(String(called("quotes", "select")[0].args[0])).not.toContain("total");
    expect(called("quotes", "select")).toHaveLength(1); // no second read for prices
  });

  it("shows the couple the price once they've opened it", async () => {
    const { sb } = mockSb({
      quotes: [{ data: [{ id: "q1", ...base, first_viewed_at: "2026-11-27T11:00:00Z" }] }, { data: [{ id: "q1", total: 4800, line_items: lines }] }],
    });
    expect((await loadThreadEstimates(sb, "couple", "t1"))[0]).toMatchObject({ opened: true, total: 4800, lines });
  });

  it("always shows the vendor their own estimate", async () => {
    const { sb } = mockSb({ quotes: { data: [{ id: "q1", ...base, first_viewed_at: null, total: 4800, line_items: lines }] } });
    expect((await loadThreadEstimates(sb, "vendor", "t1"))[0]).toMatchObject({ opened: false, total: 4800, lines });
  });
});

describe("isExpired", () => {
  it("expires after the valid-until date", () => {
    expect(isExpired({ status: "sent", validUntil: "2026-12-11" }, "2026-12-11")).toBe(false);
    expect(isExpired({ status: "sent", validUntil: "2026-12-11" }, "2026-12-12")).toBe(true);
    expect(isExpired({ status: "expired", validUntil: "2099-01-01" })).toBe(true);
  });
});
