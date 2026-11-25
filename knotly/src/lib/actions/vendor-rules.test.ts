import { describe, it, expect } from "vitest";
import { describeRule, removeRule } from "./vendor-agent-settings";
import { mockSb, UUID } from "./test-utils";

describe("removeRule", () => {
  it("rejects a bad id", async () => {
    expect((await removeRule(mockSb().sb, "v1", { id: "nope" })).ok).toBe(false);
  });

  it("turns the rule off instead of deleting it", async () => {
    const { sb, called } = mockSb({ vendor_agent_rules: { data: [{ id: UUID }] } });
    expect(await removeRule(sb, "v1", { id: UUID })).toEqual({ ok: true, data: { removed: UUID } });
    expect(called("vendor_agent_rules", "update")[0].args[0]).toEqual({ active: false });
    expect(called("vendor_agent_rules", "delete")).toHaveLength(0);
  });

  it("says when it isn't theirs, and returns database errors", async () => {
    const none = mockSb({ vendor_agent_rules: { data: [] } });
    expect(await removeRule(none.sb, "v1", { id: UUID })).toEqual({ ok: false, error: "Rule not found." });
    const bad = mockSb({ vendor_agent_rules: { error: { message: "no" } } });
    expect(await removeRule(bad.sb, "v1", { id: UUID })).toEqual({ ok: false, error: "no" });
  });
});

describe("describeRule", () => {
  it("writes each kind in plain English", () => {
    expect(describeRule("price_floor", { amount: 2500 })).toBe("Never quote less than $2,500");
    expect(describeRule("max_discount", { percent: 10 })).toBe("Discount at most 10%");
    expect(describeRule("capacity_per_day", { max: 1 })).toBe("Take at most 1 wedding per day");
    expect(describeRule("capacity_per_day", { max: 2 })).toBe("Take at most 2 weddings per day");
    expect(describeRule("blackout_weekday", { weekday: 1 })).toBe("Never available on Mondays");
    expect(describeRule("blackout_weekday", { weekday: 0, months: [6, 7] })).toBe("Never available on Sundays in Jun, Jul");
    expect(describeRule("service_radius", { miles: 40 })).toBe("Only travel within 40 miles");
    expect(describeRule("always_review", { field: "guest_count", op: ">", value: 200 })).toBe(
      "Ask me first when guest count is over 200"
    );
    expect(describeRule("always_review", { field: "days_until_wedding", op: "<", value: 30 })).toContain("under 30");
  });

  it("falls back to the kind for an unknown rule", () => {
    expect(describeRule("mystery", {})).toBe("mystery");
  });
});
