import { describe, it, expect } from "vitest";
import { autoSeat, escortCsv, escortList, plan, seatables, type SeatingTable } from "./seating";

const H = [
  { id: "h1", label: "The Patels", plus_ones: 1, guests: [{ id: "g1", first_name: "Ravi", last_name: "Patel", is_child: false }, { id: "g2", first_name: "Mira", last_name: "Patel", is_child: true }] },
  { id: "h2", label: "Jordan Lee", plus_ones: 0, guests: [{ id: "g3", first_name: "Jordan", last_name: "Lee", is_child: false }] },
];
const T: SeatingTable[] = [
  { id: "t1", name: "Table 1", shape: "round", capacity: 2, sort: 0 },
  { id: "t2", name: "Table 2", shape: "round", capacity: 4, sort: 1 },
];

describe("seatables", () => {
  it("without RSVP: everyone plus a placeholder per allowed plus-one", () => {
    expect(seatables(H, null).map((s) => s.name)).toEqual(["Ravi Patel", "Mira Patel", "Guest of Ravi", "Jordan Lee"]);
  });

  it("with RSVP: only people who said yes, the plus-ones they named, and households not answered yet", () => {
    const rsvp = { attending: new Set(["g1"]), plusOnes: new Map([["h1", [{ name: "Sam Roe" }]]]), responded: new Set(["h1"]) };
    expect(seatables(H, rsvp).map((s) => s.key)).toEqual(["g:g1", "p:h1:0", "g:g3"]);
  });
});

describe("plan", () => {
  it("places people, flags full tables and split households, ignores stale seats", () => {
    const people = seatables(H, null);
    const p = plan(T, people, [
      { table_id: "t1", household_id: "h1", guest_id: "g1", plus_index: null },
      { table_id: "t1", household_id: "h1", guest_id: "g2", plus_index: null },
      { table_id: "t1", household_id: "h2", guest_id: "g3", plus_index: null },
      { table_id: "t2", household_id: "h1", guest_id: null, plus_index: 0 },
      { table_id: "t2", household_id: "hx", guest_id: "gone", plus_index: null },
    ]);
    expect(p.byTable.get("t1")!.map((s) => s.name)).toEqual(["Ravi Patel", "Mira Patel", "Jordan Lee"]);
    expect(p.unseated).toEqual([]);
    expect(p.warnings.map((w) => w.text)).toEqual(["Table 1 has 3 people for 2 seats.", "The Patels is split across 2 tables."]);
  });
});

describe("autoSeat", () => {
  it("keeps households together, biggest first, tightest table that fits", () => {
    const p = plan(T, seatables(H, null), []);
    const seats = autoSeat(T, p);
    const at = (k: string) => seats.find((s) => (s.guest_id ? `g:${s.guest_id}` : `p:${s.household_id}:${s.plus_index}`) === k)?.table_id;
    expect([at("g:g1"), at("g:g2"), at("p:h1:0")]).toEqual(["t2", "t2", "t2"]); // 3 people: only t2 fits
    expect(at("g:g3")).toBe("t2"); // fills t2's last seat before starting t1
  });

  it("joins a household's existing table when there's room, and skips groups that fit nowhere", () => {
    const people = seatables(H, null);
    const p = plan(T, people, [{ table_id: "t2", household_id: "h1", guest_id: "g1", plus_index: null }]);
    expect(autoSeat(T, p).filter((s) => s.household_id === "h1").every((s) => s.table_id === "t2")).toBe(true);
    const tiny: SeatingTable[] = [{ id: "t9", name: "Tiny", shape: "long", capacity: 1, sort: 0 }];
    expect(autoSeat(tiny, plan(tiny, people, [])).map((s) => s.guest_id)).toEqual(["g3"]);
  });
});

describe("escort list", () => {
  it("sorts by last name", () => {
    const people = seatables(H, null);
    const p = plan(T, people, [
      { table_id: "t2", household_id: "h1", guest_id: "g1", plus_index: null },
      { table_id: "t1", household_id: "h2", guest_id: "g3", plus_index: null },
    ]);
    expect(escortList(T, p)).toEqual([{ name: "Jordan Lee", table: "Table 1" }, { name: "Ravi Patel", table: "Table 2" }]);
    expect(escortCsv(T, p).split("\r\n")[0]).toBe("Name,Table");
  });
});
