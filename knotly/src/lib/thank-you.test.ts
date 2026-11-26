import { describe, it, expect } from "vitest";
import { addressLines, giftCounts, giftsCsv, labelHouseholds, matchHousehold, type Gift, type TyHousehold } from "./thank-you";

const H: TyHousehold[] = [
  { id: "h1", label: "The Patels", address: { street: "12 Oak St", city: "Charlotte", state: "NC", zip: "28202" }, guests: [{ first_name: "Ravi", last_name: "Patel" }, { first_name: "Mira", last_name: "Patel" }] },
  { id: "h2", label: "Jordan Lee", address: {}, guests: [{ first_name: "Jordan", last_name: "Lee" }] },
  { id: "h3", label: "Ravi Shah", address: {}, guests: [{ first_name: "Ravi", last_name: "Shah" }] },
];
const gift = (o: Partial<Gift>): Gift => ({ id: "x", household_id: null, giver: null, description: "Mixer", amount_cents: null, received_on: null, thanked_on: null, notes: null, source: "manual", ...o });

describe("matchHousehold", () => {
  it("matches a full guest name or the household label", () => {
    expect(matchHousehold("ravi patel", H)).toBe("h1");
    expect(matchHousehold("The Patels", H)).toBe("h1");
    expect(matchHousehold("Jordan  Lee", H)).toBe("h2");
  });

  it("matches couples written together, but not a lone ambiguous first name", () => {
    expect(matchHousehold("Ravi & Mira", H)).toBe("h1");
    expect(matchHousehold("Ravi and Mira Patel", H)).toBe("h1");
    expect(matchHousehold("Ravi", H)).toBeNull();
    expect(matchHousehold("Someone Else", H)).toBeNull();
  });
});

describe("labels and counts", () => {
  it("formats an address and skips households without a street", () => {
    expect(addressLines(H[0])).toEqual(["The Patels", "12 Oak St", "Charlotte, NC 28202"]);
    expect(addressLines(H[1])).toBeNull();
  });

  it("labels only households still waiting for a thank-you, unless asked for all", () => {
    const gifts = [gift({ household_id: "h1" }), gift({ household_id: "h2", thanked_on: "2027-11-01" })];
    expect(labelHouseholds(H, gifts, true).map((h) => h.id)).toEqual(["h1"]);
    expect(labelHouseholds(H, gifts, false)).toHaveLength(3);
    expect(giftCounts([...gifts, gift({ giver: "Aunt May" })])).toEqual({ total: 3, thanked: 1, waiting: 2, unmatched: 1 });
  });

  it("exports gifts with addresses", () => {
    const csv = giftsCsv([gift({ household_id: "h1", amount_cents: 10000 })], H).split("\r\n");
    expect(csv[1]).toBe("The Patels,Mixer,100.00,,,12 Oak St,Charlotte,NC,28202,");
  });
});
