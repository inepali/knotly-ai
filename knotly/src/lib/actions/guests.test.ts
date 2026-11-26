import { describe, it, expect } from "vitest";
import { deleteHousehold, importHouseholds, loadGuestList, saveEvent, saveHousehold, setGuestCountFromList } from "./guests";
import { mockSb, UUID } from "./test-utils";

const project = { couple_projects: { data: { id: "p1", partner_names: "Priya & Sam", guest_count: 100 } } };
const G1 = "223e4567-e89b-42d3-a456-426614174000";

describe("saveHousehold", () => {
  it("needs at least one named guest and a wedding", async () => {
    expect((await saveHousehold(mockSb(project).sb, "u1", { guests: [] })).ok).toBe(false);
    expect((await saveHousehold(mockSb(project).sb, "u1", { guests: [{ first_name: " " }] })).ok).toBe(false);
    const none = mockSb({ couple_projects: { data: null } });
    expect((await saveHousehold(none.sb, "u1", { guests: [{ first_name: "Ana" }] })).ok).toBe(false);
  });

  it("creates a household with a default label, guests in order and invites", async () => {
    const { sb, called } = mockSb({ ...project, guest_households: { data: { id: "h1" } }, guests: {}, guest_event_invites: {} });
    const r = await saveHousehold(sb, "u1", {
      guests: [{ first_name: "Ravi", last_name: "Patel" }, { first_name: "Mira", last_name: "Patel", is_child: true }],
      tags: ["Family", "Family"],
      event_ids: [UUID],
    });
    expect(r).toEqual({ ok: true, data: { id: "h1" } });
    const row = called("guest_households", "insert")[0].args[0] as Record<string, unknown>;
    expect(row).toMatchObject({ project_id: "p1", label: "The Patels", tags: ["Family"], side: "both" });
    const gs = called("guests", "insert")[0].args[0] as { first_name: string; sort: number; household_id: string }[];
    expect(gs.map((g) => [g.first_name, g.sort, g.household_id])).toEqual([["Ravi", 0, "h1"], ["Mira", 1, "h1"]]);
    expect(called("guest_event_invites", "insert")[0].args[0]).toEqual([{ household_id: "h1", event_id: UUID }]);
  });

  it("keeps existing guest ids on edit and removes the rest", async () => {
    const { sb, called } = mockSb({ ...project, guest_households: { data: { id: UUID } }, guests: {}, guest_event_invites: {} });
    const r = await saveHousehold(sb, "u1", {
      id: UUID,
      guests: [{ id: G1, first_name: "Ravi" }, { first_name: "New" }],
    });
    expect(r.ok).toBe(true);
    expect(called("guests", "not")[0].args).toEqual(["id", "in", `(${G1})`]);
    expect((called("guests", "update")[0].args[0] as { first_name: string }).first_name).toBe("Ravi");
    expect((called("guests", "insert")[0].args[0] as { first_name: string }[]).map((g) => g.first_name)).toEqual(["New"]);
  });

  it("refuses to edit a household from another wedding", async () => {
    const { sb } = mockSb({ ...project, guest_households: { data: null } });
    expect(await saveHousehold(sb, "u1", { id: UUID, guests: [{ first_name: "A" }] })).toEqual({
      ok: false,
      error: "That household isn't on your list.",
    });
  });

  it("explains the 1,000-guest limit", async () => {
    const { sb } = mockSb({ ...project, guest_households: { data: { id: "h1" } }, guests: { error: { message: "guest_limit: …" } } });
    const r = await saveHousehold(sb, "u1", { guests: [{ first_name: "A" }] });
    expect(r).toEqual({ ok: false, error: "A guest list can have up to 1,000 guests." });
  });

  it("rejects a bad email", async () => {
    expect((await saveHousehold(mockSb(project).sb, "u1", { guests: [{ first_name: "A", email: "nope" }] })).ok).toBe(false);
  });
});

describe("importHouseholds", () => {
  it("adds each household and reports how many", async () => {
    const { sb, called } = mockSb({ ...project, guest_households: { data: { id: "h1" } }, guests: {} });
    const r = await importHouseholds(sb, "u1", { households: [{ guests: [{ first_name: "A" }] }, { guests: [{ first_name: "B" }] }] });
    expect(r).toEqual({ ok: true, data: { added: 2 } });
    expect(called("guest_households", "insert")).toHaveLength(2);
  });
});

describe("deleteHousehold", () => {
  it("only deletes within the couple's wedding", async () => {
    const { sb, called } = mockSb({ ...project, guest_households: { data: [] } });
    expect((await deleteHousehold(sb, "u1", { id: UUID })).ok).toBe(false);
    expect(called("guest_households", "eq").map((c) => c.args)).toEqual([["id", UUID], ["project_id", "p1"]]);
  });
});

describe("loadGuestList / setGuestCountFromList", () => {
  const rows = [
    {
      id: "h1", label: "The Patels", side: "a", tags: null, plus_ones: 1, address: null, notes: null,
      guests: [{ id: "g2", first_name: "Mira", last_name: "", is_child: true, email: null, phone: null, sort: 1 },
               { id: "g1", first_name: "Ravi", last_name: "", is_child: false, email: null, phone: null, sort: 0 }],
      guest_event_invites: [{ event_id: "e1" }],
    },
  ];

  it("shapes households with sorted guests and event ids", async () => {
    const r = await loadGuestList(mockSb({ ...project, guest_households: { data: rows }, wedding_events: { data: [] } }).sb, "u1");
    expect(r.ok && r.data.households[0]).toMatchObject({ tags: [], address: {}, event_ids: ["e1"] });
    expect(r.ok && r.data.households[0].guests.map((g) => g.first_name)).toEqual(["Ravi", "Mira"]);
  });

  it("copies guests + plus-ones to the wedding's guest count", async () => {
    const { sb, called } = mockSb({ ...project, guest_households: { data: rows }, wedding_events: { data: [] } });
    expect(await setGuestCountFromList(sb, "u1")).toEqual({ ok: true, data: { guest_count: 3 } });
    expect(called("couple_projects", "update")[0].args[0]).toEqual({ guest_count: 3 });
  });
});

describe("saveEvent", () => {
  it("needs a name and stores an empty time as null", async () => {
    expect((await saveEvent(mockSb(project).sb, "u1", { name: "" })).ok).toBe(false);
    const { sb, called } = mockSb({ ...project, wedding_events: { data: { id: "e1" } } });
    expect(await saveEvent(sb, "u1", { name: "Ceremony", starts_at: "" })).toEqual({ ok: true, data: { id: "e1" } });
    expect(called("wedding_events", "insert")[0].args[0]).toMatchObject({ name: "Ceremony", starts_at: null, project_id: "p1" });
  });
});
