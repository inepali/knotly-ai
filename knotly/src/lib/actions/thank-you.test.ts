import { describe, it, expect } from "vitest";
import { importFromRegistry, markThanked, saveGift } from "./thank-you";
import { mockSb, UUID } from "./test-utils";

const project = { couple_projects: { data: { id: "p1" } } };

describe("saveGift", () => {
  it("needs who it's from and the add-on", async () => {
    expect((await saveGift(mockSb(project, { data: true }).sb, "u1", { description: "Mixer" })).ok).toBe(false);
    expect((await saveGift(mockSb(project, { data: false }).sb, "u1", { description: "Mixer", giver: "Aunt May" })).ok).toBe(false);
  });

  it("saves a gift from someone not on the list", async () => {
    const { sb, called } = mockSb({ ...project, thank_you_gifts: { data: { id: "g1" } } }, { data: true });
    expect(await saveGift(sb, "u1", { description: "Mixer", giver: "Aunt May", received_on: "" })).toEqual({ ok: true, data: { id: "g1" } });
    expect(called("thank_you_gifts", "insert")[0].args[0]).toMatchObject({ giver: "Aunt May", household_id: null, received_on: null, project_id: "p1" });
  });
});

describe("markThanked", () => {
  it("stamps today, scoped to the wedding", async () => {
    const { sb, called } = mockSb({ ...project, thank_you_gifts: { data: [{ id: UUID }] } }, { data: true });
    expect(await markThanked(sb, "u1", { ids: [UUID], thanked: true }, "2027-11-02")).toEqual({ ok: true, data: { updated: 1 } });
    expect(called("thank_you_gifts", "update")[0].args[0]).toEqual({ thanked_on: "2027-11-02" });
    expect(called("thank_you_gifts", "eq").map((c) => c.args)).toContainEqual(["project_id", "p1"]);
  });
});

describe("importFromRegistry", () => {
  it("adds new claims and notes once, matching names to households", async () => {
    const { sb, called } = mockSb(
      {
        ...project,
        registry_settings: { data: null },
        registry_links: { data: [] },
        registry_funds: { data: [{ id: "f1", title: "Honeymoon", methods: [] }] },
        registry_items: { data: [{ id: "i1", title: "Mixer", price_cents: 30000, quantity: 1 }] },
        registry_claims: { data: [{ id: "c1", item_id: "i1", name: "Ravi Patel", note: null }, { id: "c2", item_id: "i1", name: "Old", note: null }] },
        registry_gift_notes: { data: [{ id: "n1", fund_id: "f1", name: "Aunt May", note: "Enjoy!" }] },
        guest_households: { data: [{ id: "h1", label: "The Patels", address: null, guests: [{ first_name: "Ravi", last_name: "Patel" }] }] },
        thank_you_gifts: [{ data: [{ source: "registry_claim", source_id: "c2" }] }, { data: null }],
      },
      { data: true }
    );
    expect(await importFromRegistry(sb, "u1")).toEqual({ ok: true, data: { added: 2, matched: 1 } });
    const rows = called("thank_you_gifts", "insert")[0].args[0] as Record<string, unknown>[];
    expect(rows.map((r) => [r.source_id, r.household_id, r.description, r.amount_cents])).toEqual([
      ["c1", "h1", "Mixer", 30000],
      ["n1", null, "Honeymoon", null],
    ]);
  });
});
