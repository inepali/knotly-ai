import { describe, it, expect } from "vitest";
import { getAgentStats, listRules, saveAgentIdentity, saveCustomInstructions, saveRule, setAutonomy } from "./vendor-agent-settings";
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

describe("saveCustomInstructions", () => {
  it("trims and saves the notes with a timestamp", async () => {
    const { sb, called } = mockSb({ vendor_agent_settings: { data: [{ vendor_id: "v1" }] } });
    const r = await saveCustomInstructions(sb, "v1", { text: "  No ceremonies before 10am.\n" });
    expect(r.ok).toBe(true);
    const update = called("vendor_agent_settings", "update")[0].args[0] as Record<string, unknown>;
    expect(update.agent_custom_instructions).toBe("No ceremonies before 10am.");
    expect(typeof update.agent_custom_instructions_updated_at).toBe("string");
    expect(called("vendor_agent_settings", "eq")[0].args).toEqual(["vendor_id", "v1"]);
  });

  it("saves an empty box as null", async () => {
    const { sb, called } = mockSb({ vendor_agent_settings: { data: [{ vendor_id: "v1" }] } });
    expect((await saveCustomInstructions(sb, "v1", { text: "   " })).ok).toBe(true);
    expect((called("vendor_agent_settings", "update")[0].args[0] as Record<string, unknown>).agent_custom_instructions).toBeNull();
  });

  it("enforces the 1,000-character cap after trimming", async () => {
    const { sb, calls } = mockSb();
    expect((await saveCustomInstructions(sb, "v1", { text: "a".repeat(1001) })).ok).toBe(false);
    expect(calls).toHaveLength(0);
    const okSb = mockSb({ vendor_agent_settings: { data: [{ vendor_id: "v1" }] } });
    expect((await saveCustomInstructions(okSb.sb, "v1", { text: ` ${"a".repeat(1000)} ` })).ok).toBe(true);
  });

  it("refuses when no row is updated (someone else's or missing settings)", async () => {
    const { sb } = mockSb({ vendor_agent_settings: { data: [] } });
    expect((await saveCustomInstructions(sb, "v2", { text: "hi" })).ok).toBe(false);
  });

  it("reports database errors", async () => {
    const { sb } = mockSb({ vendor_agent_settings: { error: { message: "denied" } } });
    expect(await saveCustomInstructions(sb, "v1", { text: "hi" })).toEqual({ ok: false, error: "denied" });
  });
});

describe("saveAgentIdentity", () => {
  it("rejects a bad name without touching the database", async () => {
    const { sb, calls } = mockSb();
    expect((await saveAgentIdentity(sb, "v1", { name: "Knotly", enabled: true })).ok).toBe(false);
    expect((await saveAgentIdentity(sb, "v1", { name: "M4ya", enabled: true })).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("saves the name and switch; an empty name clears it", async () => {
    const { sb, called } = mockSb({ vendor_agent_settings: { data: [{ vendor_id: "v1" }] } });
    expect(await saveAgentIdentity(sb, "v1", { name: "  Maya ", enabled: true })).toEqual({
      ok: true,
      data: { name: "Maya", enabled: true },
    });
    expect(called("vendor_agent_settings", "update")[0].args[0]).toEqual({ agent_display_name: "Maya", public_chat_enabled: true });
    expect((await saveAgentIdentity(sb, "v1", { name: "", enabled: false })).ok).toBe(true);
    expect(called("vendor_agent_settings", "update")[1].args[0]).toEqual({ agent_display_name: null, public_chat_enabled: false });
  });

  it("asks for a business profile when there's no settings row", async () => {
    const { sb } = mockSb({ vendor_agent_settings: { data: [] } });
    expect((await saveAgentIdentity(sb, "v1", { name: "Maya", enabled: true })).ok).toBe(false);
  });
});
