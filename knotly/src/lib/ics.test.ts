import { describe, expect, it } from "vitest";
import { buildIcs } from "./ics";

const now = new Date("2026-11-25T10:00:00Z");

describe("buildIcs", () => {
  it("makes a calendar with all-day events ending the next day", () => {
    const ics = buildIcs("Knotly bookings", [{ uid: "a@knotly", date: "2027-05-31", summary: "Booked" }], now);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("UID:a@knotly");
    expect(ics).toContain("DTSTAMP:20261125T100000Z");
    expect(ics).toContain("DTSTART;VALUE=DATE:20270531");
    expect(ics).toContain("DTEND;VALUE=DATE:20270601"); // rolls over the month end
  });

  it("escapes commas, semicolons and new lines in text", () => {
    const ics = buildIcs("Cal", [{ uid: "b", date: "2027-12-31", summary: "Priya, Sam; & co", description: "a\nb" }], now);
    expect(ics).toContain("SUMMARY:Priya\\, Sam\\; & co");
    expect(ics).toContain("DESCRIPTION:a\\nb");
    expect(ics).toContain("DTEND;VALUE=DATE:20280101"); // rolls over the year end
  });

  it("folds long lines at 75 characters", () => {
    const ics = buildIcs("Cal", [{ uid: "c", date: "2027-01-01", summary: "x".repeat(200) }], now);
    for (const line of ics.split("\r\n")) expect(line.length).toBeLessThanOrEqual(75);
  });

  it("is a valid empty calendar with no events", () => {
    expect(buildIcs("Cal", [], now)).not.toContain("BEGIN:VEVENT");
  });
});
