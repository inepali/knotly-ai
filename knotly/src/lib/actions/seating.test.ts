import { describe, it, expect } from "vitest";
import { addTables, setSeats } from "./seating";
import { mockSb, UUID } from "./test-utils";

const G = "223e4567-e89b-42d3-a456-426614174000";
const T = "323e4567-e89b-42d3-a456-426614174000";
const project = { couple_projects: { data: { id: "p1" } } };

describe("addTables", () => {
  it("needs the add-on", async () => {
    expect((await addTables(mockSb(project, { data: false }).sb, "u1", { count: 2, capacity: 8, shape: "round" })).ok).toBe(false);
  });
});

describe("setSeats", () => {
  it("moves a guest: clears the old seat, then seats them", async () => {
    const { sb, called } = mockSb({ ...project, seating_assignments: {} }, { data: true });
    const r = await setSeats(sb, "u1", { seats: [{ household_id: UUID, guest_id: G, plus_index: null, table_id: T }] });
    expect(r).toEqual({ ok: true, data: { seated: 1 } });
    expect(called("seating_assignments", "in")[0].args).toEqual(["guest_id", [G]]);
    expect(called("seating_assignments", "insert")[0].args[0]).toEqual([{ table_id: T, household_id: UUID, guest_id: G, plus_index: null }]);
  });

  it("unseats a plus-one without inserting", async () => {
    const { sb, called } = mockSb({ ...project, seating_assignments: {} }, { data: true });
    expect((await setSeats(sb, "u1", { seats: [{ household_id: UUID, guest_id: null, plus_index: 0, table_id: null }] })).ok).toBe(true);
    expect(called("seating_assignments", "insert")).toHaveLength(0);
  });

  it("refuses a seat that's neither a guest nor a plus-one", async () => {
    const r = await setSeats(mockSb(project, { data: true }).sb, "u1", { seats: [{ household_id: UUID, guest_id: G, plus_index: 0, table_id: T }] });
    expect(r.ok).toBe(false);
  });
});
