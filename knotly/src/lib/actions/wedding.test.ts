import { describe, it, expect } from "vitest";
import { getMyWedding, saveWeddingDetails, saveWeddingForm } from "./wedding";
import { mockSb } from "./test-utils";

describe("saveWeddingDetails", () => {
  it("rejects bad input before touching the database", async () => {
    const { sb, calls } = mockSb();
    const r = await saveWeddingDetails(sb, "u1", { guestCount: -3 });
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("rejects an unknown need category", async () => {
    const { sb } = mockSb();
    expect((await saveWeddingDetails(sb, "u1", { needs: ["unicorns"] })).ok).toBe(false);
  });

  it("errors when the metro isn't served", async () => {
    const { sb } = mockSb({ metros: { data: null } });
    const r = await saveWeddingDetails(sb, "u1", { metro: "Atlantis" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("Atlantis");
  });

  it("inserts a new project and reports missing fields", async () => {
    const row = { id: "p1", partner_names: "A & B", needs: [] };
    const { sb, called } = mockSb({ couple_projects: [{ data: null }, { data: row }] });
    const r = await saveWeddingDetails(sb, "u1", { partnerNames: "A & B" });
    expect(r.ok && r.data.wedding).toEqual(row);
    expect(r.ok && r.data.missing).toContain("needs");
    expect(r.ok && r.data.missing).not.toContain("partner_names");
    expect(called("couple_projects", "insert")[0].args[0]).toEqual({ couple_id: "u1", partner_names: "A & B" });
  });

  it("updates the existing project with only the fields sent", async () => {
    const { sb, called } = mockSb({ couple_projects: [{ data: { id: "p1" } }, { data: { id: "p1" } }] });
    await saveWeddingDetails(sb, "u1", { venue: "Crystal Ballroom" });
    expect(called("couple_projects", "update")[0].args[0]).toEqual({ venue: "Crystal Ballroom" });
  });

  it("returns the database error", async () => {
    const { sb } = mockSb({ couple_projects: [{ data: null }, { error: { message: "boom" } }] });
    expect(await saveWeddingDetails(sb, "u1", { venue: "x" })).toEqual({ ok: false, error: "boom" });
  });
});

describe("getMyWedding", () => {
  it("returns {empty:true} when nothing is saved", async () => {
    const { sb } = mockSb({ couple_projects: { data: null } });
    expect(await getMyWedding(sb, "u1")).toEqual({ ok: true, data: { empty: true } });
  });
});

describe("saveWeddingForm", () => {
  it("rejects a budget that isn't a whole positive number", async () => {
    const { sb } = mockSb();
    expect((await saveWeddingForm(sb, "u1", { needBudgets: [{ category: "dj", budget: -5 }] })).ok).toBe(false);
    expect((await saveWeddingForm(sb, "u1", { needBudgets: [{ category: "unicorns", budget: 5 }] })).ok).toBe(false);
  });

  it("keeps project_needs in step: drops removed needs, adds new ones, sets budgets", async () => {
    const { sb, called } = mockSb({
      couple_projects: [{ data: { id: "p1" } }, { data: { id: "p1", needs: ["venue", "florist"] } }],
      project_needs: { data: [{ category: "venue" }, { category: "dj" }] },
    });
    const r = await saveWeddingForm(sb, "u1", {
      needs: ["venue", "florist"],
      needBudgets: [{ category: "venue", budget: 9000 }, { category: "florist", budget: null }],
    });
    expect(r.ok).toBe(true);
    expect(called("project_needs", "in")[0].args).toEqual(["category", ["dj"]]);
    expect(called("project_needs", "delete")).toHaveLength(1);
    expect(called("project_needs", "upsert")[0].args[0]).toEqual([
      { project_id: "p1", category: "venue" },
      { project_id: "p1", category: "florist" },
    ]);
    expect(called("project_needs", "update").map((c) => c.args[0])).toEqual([{ budget: 9000 }, { budget: null }]);
  });

  it("saves the love story and project details, and caps their length", async () => {
    const { sb, called } = mockSb({ couple_projects: [{ data: null }, { data: { id: "p1" } }] });
    const r = await saveWeddingForm(sb, "u1", { loveStory: "We met in 2019.", projectDetails: "" });
    expect(r.ok).toBe(true);
    expect(called("couple_projects", "insert")[0].args[0]).toMatchObject({
      love_story: "We met in 2019.",
      project_details: "",
    });
    const bad = mockSb();
    expect((await saveWeddingForm(bad.sb, "u1", { loveStory: "x".repeat(2001) })).ok).toBe(false);
  });

  it("saves hours of service per category and validates the range", async () => {
    const { sb, called } = mockSb({
      couple_projects: [{ data: { id: "p1" } }, { data: { id: "p1" } }],
      project_needs: { data: [] },
    });
    const r = await saveWeddingForm(sb, "u1", {
      needs: ["photographer", "dj"],
      needBudgets: [
        { category: "photographer", budget: null, hours: 6 },
        { category: "dj", budget: 1500, hours: null },
      ],
    });
    expect(r.ok).toBe(true);
    expect(called("project_needs", "update").map((c) => c.args[0])).toEqual([
      { budget: null, service_hours: 6 },
      { budget: 1500, service_hours: null },
    ]);
    const bad = mockSb();
    expect((await saveWeddingForm(bad.sb, "u1", { needBudgets: [{ category: "dj", budget: null, hours: 0 }] })).ok).toBe(false);
    expect((await saveWeddingForm(bad.sb, "u1", { needBudgets: [{ category: "dj", budget: null, hours: 25 }] })).ok).toBe(false);
  });

  it("leaves project_needs alone when the form sends no needs", async () => {
    const { sb, calls } = mockSb({ couple_projects: [{ data: { id: "p1" } }, { data: { id: "p1" } }] });
    await saveWeddingForm(sb, "u1", { venue: "Crystal Ballroom" });
    expect(calls.some((c) => c.table === "project_needs")).toBe(false);
  });

  it("returns a project_needs error", async () => {
    const { sb } = mockSb({
      couple_projects: [{ data: { id: "p1" } }, { data: { id: "p1" } }],
      project_needs: { error: { message: "rls" } },
    });
    expect(await saveWeddingForm(sb, "u1", { needs: ["venue"] })).toEqual({ ok: false, error: "rls" });
  });
});

describe("saveWeddingDetails also syncs needs", () => {
  it("writes project_needs when needs are sent", async () => {
    const { sb, called } = mockSb({ couple_projects: [{ data: null }, { data: { id: "p1" } }], project_needs: { data: [] } });
    await saveWeddingDetails(sb, "u1", { needs: ["dj"] });
    expect(called("project_needs", "upsert")).toHaveLength(1);
  });
});
