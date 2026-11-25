import { describe, it, expect } from "vitest";
import { getAgentStats, listRules, saveRule, setAutonomy } from "./vendor-agent-settings";
import { mockSb } from "./test-utils";

describe("setAutonomy", () => {
  it("only accepts whole levels 0-3", async () => {
    const { sb } = mockSb();
    for (const level of [-1, 4, 1.5, "2"]) expect((await setAutonomy(sb, "v1", { level })).ok).toBe(false);
  });

  it("saves and reports database errors", async () => {
    expect(await setAutonomy(mockSb({ vendor_agent_settings: {} }).sb, "v1", { level: 2 })).toEqual({
      ok: true,
      data: { level: 2 },
    });
    const bad = mockSb({ vendor_agent_settings: { error: { message: "denied" } } });
    expect(await setAutonomy(bad.sb, "v1", { level: 2 })).toEqual({ ok: false, error: "denied" });
  });
});

describe("saveRule", () => {
  it("rejects a malformed rule", async () => {
    const { sb, calls } = mockSb();
    expect((await saveRule(sb, "v1", { rule: { kind: "nonsense" }, sourceText: "x" })).ok).toBe(false);
    expect((await saveRule(sb, "v1", { rule: { kind: "always_review" } })).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("deactivates the old rule of the same kind first", async () => {
    const { sb, called } = mockSb({ vendor_agent_rules: { data: { id: "r1" } } });
    const r = await saveRule(sb, "v1", {
      rule: { kind: "capacity_per_day", max: 2 },
      sourceText: "two a day",
    });
    expect(r.ok).toBe(true);
    expect(called("vendor_agent_rules", "update")[0].args[0]).toEqual({ active: false });
  });

  it("lets blackout rules repeat (no deactivation)", async () => {
    const { sb, called } = mockSb({ vendor_agent_rules: { data: { id: "r1" } } });
    await saveRule(sb, "v1", { rule: { kind: "blackout_weekday", weekday: 1 }, sourceText: "no mondays" });
    expect(called("vendor_agent_rules", "update")).toHaveLength(0);
  });

  it("returns the database error", async () => {
    const { sb } = mockSb({ vendor_agent_rules: [{}, { error: { message: "dup" } }] });
    const r = await saveRule(sb, "v1", { rule: { kind: "capacity_per_day", max: 2 }, sourceText: "x" });
    expect(r).toEqual({ ok: false, error: "dup" });
  });
});

describe("listRules / getAgentStats", () => {
  it("lists rules and settings", async () => {
    const { sb } = mockSb({
      vendor_agent_rules: { data: [{ id: "r1" }] },
      vendor_agent_settings: { data: { autonomy_level: 1 } },
    });
    expect(await listRules(sb, "v1")).toEqual({
      ok: true,
      data: { rules: [{ id: "r1" }], settings: { autonomy_level: 1 } },
    });
  });

  it("suggests Autopilot after 20+ approvals at 90%+", async () => {
    const { sb } = mockSb({
      vendor_agent_stats: { data: { approved_as_is: 20, changed_by_human: 1 } },
      vendor_agent_settings: { data: { autonomy_level: 1 } },
    });
    const r = await getAgentStats(sb, "v1");
    expect(r.ok && r.data.suggestion).toContain("Autopilot");
  });

  it("has no rate or suggestion without history", async () => {
    const { sb } = mockSb({ vendor_agent_settings: { data: { autonomy_level: 0 } } });
    const r = await getAgentStats(sb, "v1");
    expect(r.ok && r.data.approvalRate).toBeNull();
    expect(r.ok && r.data.suggestion).toBeNull();
  });
});
