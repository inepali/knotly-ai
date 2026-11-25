import { describe, it, expect } from "vitest";
import { getMyWedding, saveWeddingDetails } from "./wedding";
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
