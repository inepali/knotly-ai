import { describe, expect, it } from "vitest";
import { ensureFeedToken, resetFeedToken } from "./calendar-feed";
import { mockSb } from "./test-utils";

describe("ensureFeedToken", () => {
  it("returns the existing token without creating another", async () => {
    const { sb, called } = mockSb({ vendor_calendar_feeds: { data: { token: "abc" } } });
    expect(await ensureFeedToken(sb, "v1")).toBe("abc");
    expect(called("vendor_calendar_feeds", "insert")).toHaveLength(0);
  });

  it("creates one the first time", async () => {
    const { sb, called } = mockSb({ vendor_calendar_feeds: [{ data: null }, { data: { token: "new" } }] });
    expect(await ensureFeedToken(sb, "v1")).toBe("new");
    expect(called("vendor_calendar_feeds", "insert")[0].args[0]).toEqual({ vendor_id: "v1" });
  });

  it("returns null when the table isn't there yet", async () => {
    const { sb } = mockSb({ vendor_calendar_feeds: { data: null, error: { message: "missing" } } });
    expect(await ensureFeedToken(sb, "v1")).toBeNull();
  });
});

describe("resetFeedToken", () => {
  it("replaces the token", async () => {
    const { sb, called } = mockSb({ vendor_calendar_feeds: { data: { token: "fresh" } } });
    expect(await resetFeedToken(sb, "v1")).toEqual({ ok: true, data: { token: "fresh" } });
    expect(called("vendor_calendar_feeds", "delete")).toHaveLength(1);
    expect(called("vendor_calendar_feeds", "insert")).toHaveLength(1);
  });

  it("reports a database error", async () => {
    const { sb } = mockSb({ vendor_calendar_feeds: { error: { message: "rls" } } });
    expect(await resetFeedToken(sb, "v1")).toEqual({ ok: false, error: "rls" });
  });
});
