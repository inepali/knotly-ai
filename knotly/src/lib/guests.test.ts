import { describe, it, expect } from "vitest";
import { defaultLabel, exportCsv, guestTotals, matchesSearch, parseCsv, previewImport, sideNames, toCsv, type Household } from "./guests";

const hh = (over: Partial<Household> = {}): Household => ({
  label: "The Patels",
  side: "a",
  tags: ["Family"],
  plus_ones: 0,
  address: { city: "Charlotte" },
  notes: null,
  guests: [
    { first_name: "Ravi", last_name: "Patel", is_child: false, email: "ravi@x.co", phone: null },
    { first_name: "Mira", last_name: "Patel", is_child: true, email: null, phone: null },
  ],
  event_ids: ["e1"],
  ...over,
});

describe("sideNames / defaultLabel", () => {
  it("splits partner names", () => {
    expect(sideNames("Priya & Sam")).toEqual({ a: "Priya", b: "Sam", both: "Both" });
    expect(sideNames("Ana and Ben").b).toBe("Ben");
    expect(sideNames(null).a).toBe("Partner A");
  });

  it("names a household sensibly", () => {
    expect(defaultLabel(hh().guests)).toBe("The Patels");
    expect(defaultLabel([{ first_name: "Ana", last_name: "Diaz" }, { first_name: "Ben", last_name: "Ko" }])).toBe("Ana & Ben");
    expect(defaultLabel([{ first_name: "Jo", last_name: "Lee" }])).toBe("Jo Lee");
    expect(defaultLabel([{ first_name: "Ana", last_name: "Jones" }, { first_name: "Bo", last_name: "Jones" }])).toBe("The Jones");
    expect(defaultLabel([])).toBe("New household");
  });
});

describe("guestTotals", () => {
  it("counts guests, kids, plus-ones, sides and events", () => {
    const t = guestTotals([hh(), hh({ side: "b", plus_ones: 1, guests: [hh().guests[0]], event_ids: [] })]);
    expect(t).toMatchObject({ households: 2, guests: 3, adults: 2, kids: 1, plusOnes: 1, invited: 4 });
    expect(t.bySide).toEqual({ a: 2, b: 2, both: 0 });
    expect(t.byEvent).toEqual({ e1: 2 });
  });
});

describe("matchesSearch", () => {
  it("matches every word across names, tags and city", () => {
    expect(matchesSearch(hh(), "mira charlotte")).toBe(true);
    expect(matchesSearch(hh(), "family")).toBe(true);
    expect(matchesSearch(hh(), "raleigh")).toBe(false);
    expect(matchesSearch(hh(), "  ")).toBe(true);
  });
});

describe("CSV", () => {
  it("parses quotes, commas and newlines inside quotes", () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi""\nok"\n\n')).toEqual([["a", "b"], ["x, y", 'he said "hi"\nok']]);
  });

  it("neutralizes formulas on export but leaves phone numbers alone", () => {
    expect(toCsv([["=HYPERLINK(1)", "+1 704 555 0100", "-3", "@x"]])).toBe("'=HYPERLINK(1),+1 704 555 0100,-3,'@x\r\n");
  });

  it("groups rows into households and maps sides by partner name", () => {
    const csv = [
      "First Name,Last Name,Household,Guest of,Child,Plus ones,Street,City",
      "Ravi,Patel,The Patels,Priya,,0,12 Oak,Charlotte",
      "Mira,Patel,The Patels,Priya,yes,0,12 Oak,Charlotte",
      "Jordan,Lee,,Sam,,1,,Raleigh",
      "Casey,Lee,,Sam,,0,,Durham",
      ",,,,,,,",
      ",Nobody,,,,,,",
    ].join("\n");
    const p = previewImport(csv, "Priya & Sam");
    expect(p.households.map((h) => h.label)).toEqual(["The Patels", "Jordan Lee", "Casey Lee"]);
    expect(p.households[0].guests[1].is_child).toBe(true);
    expect(p.households[0].side).toBe("a");
    expect(p.households[1]).toMatchObject({ side: "b", plus_ones: 1, address: { city: "Raleigh" } });
    expect(p.skipped).toBe(1);
  });

  it("groups by last name + street when there's no household column", () => {
    const p = previewImport("First,Last,Address\nAna,Diaz,1 Elm\nLuis,Diaz,1 Elm\nEva,Diaz,9 Pine", null);
    expect(p.households.map((h) => h.guests.length)).toEqual([2, 1]);
    expect(p.households[0].label).toBe("The Diazs");
  });

  it("splits a single Name column", () => {
    const p = previewImport("Name,Email\nAna Maria Lopez,ana@x.co", null);
    expect(p.households[0].guests[0]).toMatchObject({ first_name: "Ana Maria", last_name: "Lopez", email: "ana@x.co" });
  });

  it("needs a first-name column", () => {
    expect(previewImport("Email\na@b.co", null).problems[0]).toMatch(/First name/);
    expect(previewImport("", null).households).toEqual([]);
  });

  it("round-trips through export", () => {
    const csv = exportCsv([hh({ tags: ["Family", "Close"], plus_ones: 2, address: { street: "12 Oak", city: "Charlotte" } })], "Priya & Sam");
    const back = previewImport(csv, "Priya & Sam");
    expect(back.households).toHaveLength(1);
    expect(back.households[0]).toMatchObject({ label: "The Patels", side: "a", plus_ones: 2, tags: ["Family", "Close"] });
    expect(back.households[0].guests.map((g) => g.first_name)).toEqual(["Ravi", "Mira"]);
  });
});
