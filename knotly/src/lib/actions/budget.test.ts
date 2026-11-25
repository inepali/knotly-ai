import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/budget", () => ({ loadBudget: vi.fn(async () => ({ lines: [] })) }));
import { applyDefaultBudgetSplit, getBudget, planBudget, recordBooking } from "./budget";
import { mockSb, UUID } from "./test-utils";

describe("planBudget", () => {
  it("rejects an empty allocation list and negative amounts", async () => {
    const { sb } = mockSb();
    expect((await planBudget(sb, "u1", { allocations: [], fromCouple: true })).ok).toBe(false);
    const r = await planBudget(sb, "u1", {
      allocations: [{ category: "other", amount: -5 }],
      fromCouple: true,
    });
    expect(r.ok).toBe(false);
  });

  it("needs saved wedding details", async () => {
    const { sb } = mockSb({ couple_projects: { data: null } });
    const r = await planBudget(sb, "u1", { allocations: [{ category: "other", amount: 5 }], fromCouple: true });
    expect(r).toEqual({ ok: false, error: "Save wedding details first." });
  });

  it("never overwrites the couple's own target with an AI suggestion", async () => {
    const { sb, called } = mockSb({
      couple_projects: { data: { id: "p1" } },
      budget_items: { data: [{ category: "other", label: "Rings", planned_by: "couple" }] },
    });
    const r = await planBudget(sb, "u1", {
      allocations: [{ category: "other", label: "Rings", amount: 900 }],
      fromCouple: false,
    });
    expect(r.ok && r.data.keptCoupleTargets).toEqual(["Rings"]);
    expect(called("budget_items", "upsert")).toHaveLength(0);
  });

  it("upserts allocations and surfaces database errors", async () => {
    const input = { allocations: [{ category: "other", label: "Rings", amount: 900 }], fromCouple: true };
    const good = mockSb({ couple_projects: { data: { id: "p1" } }, budget_items: { data: [] } });
    expect((await planBudget(good.sb, "u1", input)).ok).toBe(true);
    expect(good.called("budget_items", "upsert")[0].args[0]).toMatchObject([
      { project_id: "p1", planned: 900, planned_by: "couple" },
    ]);

    const bad = mockSb({
      couple_projects: { data: { id: "p1" } },
      budget_items: [{ data: [] }, { error: { message: "nope" } }],
    });
    expect(await planBudget(bad.sb, "u1", input)).toEqual({ ok: false, error: "nope" });
  });
});

describe("recordBooking", () => {
  it("rejects a negative amount", async () => {
    expect((await recordBooking(mockSb().sb, "u1", { category: "other", amount: -1 })).ok).toBe(false);
  });

  it("needs saved wedding details", async () => {
    const { sb } = mockSb({ couple_projects: { data: null } });
    expect((await recordBooking(sb, "u1", { category: "other", amount: 10 })).ok).toBe(false);
  });

  it("drops a vendorId that isn't a uuid, keeps a real one", async () => {
    const a = mockSb({ couple_projects: { data: { id: "p1" } }, budget_items: { data: null } });
    await recordBooking(a.sb, "u1", { category: "other", amount: 10, vendorId: "nope" });
    expect(a.called("budget_items", "upsert")[0].args[0]).toMatchObject({ booked_vendor_id: null, booked: 10 });
    const b = mockSb({ couple_projects: { data: { id: "p1" } }, budget_items: { data: null } });
    await recordBooking(b.sb, "u1", { category: "other", amount: 10, vendorId: UUID });
    expect(b.called("budget_items", "upsert")[0].args[0]).toMatchObject({ booked_vendor_id: UUID });
  });

  it("returns the database error", async () => {
    const { sb } = mockSb({ couple_projects: { data: { id: "p1" } }, budget_items: { error: { message: "x" } } });
    expect(await recordBooking(sb, "u1", { category: "other", amount: 10 })).toEqual({ ok: false, error: "x" });
  });
});

describe("getBudget", () => {
  it("returns the loaded budget", async () => {
    expect(await getBudget(mockSb().sb, "u1")).toEqual({ ok: true, data: { lines: [] } });
  });
});

describe("applyDefaultBudgetSplit", () => {
  it("needs wedding details, a total budget and some needs", async () => {
    expect((await applyDefaultBudgetSplit(mockSb({ couple_projects: { data: null } }).sb, "u1")).ok).toBe(false);
    const noTotal = mockSb({ couple_projects: { data: { id: "p1", budget_total: null } } });
    expect(await applyDefaultBudgetSplit(noTotal.sb, "u1")).toEqual({ ok: false, error: "Add your total budget first." });
    const noNeeds = mockSb({ couple_projects: { data: { id: "p1", budget_total: 20000 } }, project_needs: { data: [] } });
    expect(await applyDefaultBudgetSplit(noNeeds.sb, "u1")).toEqual({ ok: false, error: "Choose the vendor types you need first." });
  });

  it("splits the total as a suggestion, without overwriting the couple's own targets", async () => {
    const { sb, called } = mockSb({
      couple_projects: { data: { id: "p1", budget_total: 20000 } },
      project_needs: { data: [{ category: "venue" }, { category: "photographer" }] },
      budget_items: { data: [{ category: "venue", label: null, planned_by: "couple" }] },
    });
    const r = await applyDefaultBudgetSplit(sb, "u1");
    expect(r.ok && r.data.keptCoupleTargets).toEqual(["venue"]);
    const rows = called("budget_items", "upsert")[0].args[0] as { category: string; planned_by: string }[];
    expect(rows.map((x) => [x.category, x.planned_by])).toEqual([["photographer", "ai"]]);
  });
});
