import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS, findHouseholds, householdEvents, isClosed, responsesCsv, summarize, validateSubmission, type RsvpHousehold } from "./rsvp";

const H: RsvpHousehold = {
  id: "h1",
  label: "The Patels",
  plus_ones: 1,
  invite_token: "tok1",
  rsvp_code: "ABC123",
  guests: [
    { id: "g1", first_name: "Ravi", last_name: "Patel", is_child: false },
    { id: "g2", first_name: "Mira", last_name: "Patel", is_child: true },
  ],
  event_ids: ["e1"],
};
const H2: RsvpHousehold = { ...H, id: "h2", label: "Jordan Lee", invite_token: "tok2", rsvp_code: "ZZZ999", plus_ones: 0, guests: [{ id: "g3", first_name: "Jordan", last_name: "Lee", is_child: false }], event_ids: [] };
const EVENTS = [{ id: "e1", name: "Ceremony" }, { id: "e2", name: "Reception" }];
const S = { ...DEFAULT_SETTINGS, meal_options: ["Chicken", "Veg"] };

describe("findHouseholds", () => {
  it("needs first and last name and never lists everyone", () => {
    expect(findHouseholds([H, H2], "Patel")).toEqual([]);
    expect(findHouseholds([H, H2], "ravi patel").map((h) => h.id)).toEqual(["h1"]);
    expect(findHouseholds([H, H2], "Rav Pat").map((h) => h.id)).toEqual(["h1"]);
    expect(findHouseholds([H, H2], "ra pa")).toEqual([]);
    expect(findHouseholds([H, H2], "Mira Lee")).toEqual([]); // words must match the same guest
  });

  it("checks the code when the couple requires one", () => {
    expect(findHouseholds([H], "Ravi Patel", "", true)).toEqual([]);
    expect(findHouseholds([H], "Ravi Patel", "abc123", true).map((h) => h.id)).toEqual(["h1"]);
  });
});

describe("householdEvents / isClosed", () => {
  it("uses invited events, else all, else a single main one", () => {
    expect(householdEvents(H, EVENTS).map((e) => e.id)).toEqual(["e1"]);
    expect(householdEvents(H2, EVENTS).map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(householdEvents(H, []).map((e) => e.id)).toEqual(["main"]);
  });

  it("stays open through the deadline day", () => {
    expect(isClosed("2027-09-01", new Date("2027-09-01T20:00:00-04:00"))).toBe(false);
    expect(isClosed("2027-09-01", new Date("2027-09-03T00:00:00Z"))).toBe(true);
    expect(isClosed(null)).toBe(false);
  });
});

describe("validateSubmission", () => {
  const ok = {
    guests: [
      { guest_id: "g1", events: { e1: "attending" as const }, meal: "Chicken", dietary: "No nuts" },
      { guest_id: "g2", events: { e1: "declined" as const }, meal: "Chicken" },
    ],
    plus_ones: [{ name: "Sam", meal: "Veg" }],
  };

  it("turns answers into rows, clearing meals for people who aren't coming", () => {
    const r = validateSubmission(ok, H, EVENTS, S);
    expect(r.ok && r.rows).toEqual([
      { guest_id: "g1", event_id: "e1", status: "attending", meal: "Chicken", dietary: "No nuts" },
      { guest_id: "g2", event_id: "e1", status: "declined", meal: null, dietary: null },
    ]);
    expect(r.ok && r.household.plus_ones).toEqual([{ name: "Sam", meal: "Veg" }]);
  });

  it("requires an answer for every guest and event, and a listed meal", () => {
    expect(validateSubmission({ guests: [ok.guests[0]] }, H, EVENTS, S).ok).toBe(false);
    expect(validateSubmission({ ...ok, guests: [{ ...ok.guests[0], events: {} }, ok.guests[1]] }, H, EVENTS, S).ok).toBe(false);
    expect(validateSubmission({ ...ok, guests: [{ ...ok.guests[0], meal: "Lobster" }, ok.guests[1]] }, H, EVENTS, S).ok).toBe(false);
  });

  it("refuses strangers, extra plus-ones, lone plus-ones and bots", () => {
    expect(validateSubmission({ ...ok, guests: [...ok.guests, { guest_id: "g3", events: { e1: "attending" } }] }, H, EVENTS, S).ok).toBe(false);
    expect(validateSubmission({ ...ok, plus_ones: [{ name: "A", meal: "Veg" }, { name: "B", meal: "Veg" }] }, H, EVENTS, S).ok).toBe(false);
    const nobody = { guests: ok.guests.map((g) => ({ ...g, events: { e1: "declined" as const } })), plus_ones: [{ name: "Sam", meal: "Veg" }] };
    expect(validateSubmission(nobody, H, EVENTS, S).ok).toBe(false);
    expect(validateSubmission({ ...ok, website: "spam" }, H, EVENTS, S).ok).toBe(false);
  });

  it("uses a null event when there are no events", () => {
    const r = validateSubmission({ guests: [{ guest_id: "g3", events: { main: "attending" } }] }, H2, [], DEFAULT_SETTINGS);
    expect(r.ok && r.rows[0]).toMatchObject({ event_id: null, status: "attending", meal: null });
  });
});

describe("summarize / CSV", () => {
  const responses = [
    { guest_id: "g1", event_id: "e1", status: "attending" as const, meal: "Chicken", dietary: null },
    { guest_id: "g2", event_id: "e1", status: "declined" as const, meal: null, dietary: null },
  ];
  const answers = new Map([["h1", { plus_ones: [{ name: "Sam", meal: "Veg" }], answers: {}, song: null, note: "Yay", responded_at: "2027-01-01" }]]);

  it("counts per event, meals, plus-ones and who's waiting", () => {
    const s = summarize([H, H2], EVENTS, responses, answers);
    expect(s.byEvent.e1).toEqual({ attending: 2, declined: 1, waiting: 1 });
    expect(s.byEvent.e2).toEqual({ attending: 0, declined: 0, waiting: 1 });
    expect(s.meals).toEqual({ Chicken: 1, Veg: 1 });
    expect(s.responded).toBe(1);
    expect(s.waiting.map((h) => h.id)).toEqual(["h2"]);
  });

  it("exports one row per guest per event plus plus-ones", () => {
    const csv = responsesCsv([H], EVENTS, responses, answers, S).trim().split("\r\n");
    expect(csv[0]).toBe("Household,Guest,Event,Response,Meal,Dietary,Song,Note");
    expect(csv.slice(1)).toEqual([
      "The Patels,Ravi Patel,Ceremony,attending,Chicken,,,Yay",
      "The Patels,Mira Patel,Ceremony,declined,,,,Yay",
      "The Patels,Sam (plus-one),Ceremony,attending,Veg,,,Yay",
    ]);
  });
});
