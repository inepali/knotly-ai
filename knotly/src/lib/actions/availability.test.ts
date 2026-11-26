import { describe, it, expect } from "vitest";
import { saveConsultHours, setAvailability } from "./availability";
import { mockSb } from "./test-utils";

describe("setAvailability", () => {
  it("rejects no dates, too many dates, and unknown statuses", async () => {
    const { sb } = mockSb();
    expect((await setAvailability(sb, "v1", { dates: [], status: "blocked" })).ok).toBe(false);
    const many = Array.from({ length: 61 }, (_, i) => `2027-01-${i}`);
    expect((await setAvailability(sb, "v1", { dates: many, status: "blocked" })).ok).toBe(false);
    expect((await setAvailability(sb, "v1", { dates: ["2027-01-01"], status: "maybe" })).ok).toBe(false);
  });

  it("upserts blocked/booked dates", async () => {
    const { sb, called } = mockSb();
    const r = await setAvailability(sb, "v1", { dates: ["2027-05-01"], status: "booked" });
    expect(r).toEqual({ ok: true, data: { dates: ["2027-05-01"], status: "booked" } });
    expect(called("vendor_availability", "upsert")[0].args[0]).toMatchObject([
      { vendor_id: "v1", date: "2027-05-01", status: "booked" },
    ]);
  });

  it("won't block or book dates in the past, but lets old markers be freed", async () => {
    const { sb, calls } = mockSb();
    expect(await setAvailability(sb, "v1", { dates: ["2020-01-01"], status: "blocked" })).toEqual({
      ok: false,
      error: "You can't block or book dates in the past.",
    });
    expect((await setAvailability(sb, "v1", { dates: ["2027-05-01", "2020-01-01"], status: "booked" })).ok).toBe(false);
    expect(calls).toHaveLength(0);
    expect((await setAvailability(sb, "v1", { dates: ["2020-01-01"], status: "free" })).ok).toBe(true);
  });

  it("rejects malformed dates", async () => {
    const { sb } = mockSb();
    expect((await setAvailability(sb, "v1", { dates: ["next friday"], status: "blocked" })).ok).toBe(false);
  });

  it("replaces a blocked marker when the day is booked, instead of keeping both", async () => {
    const { sb, called } = mockSb();
    await setAvailability(sb, "v1", { dates: ["2027-05-01"], status: "booked" });
    expect(called("vendor_availability", "neq")[0].args).toEqual(["status", "booked"]);
    expect(called("vendor_availability", "delete")).toHaveLength(1);
  });

  it("deletes when freeing dates", async () => {
    const { sb, called } = mockSb();
    await setAvailability(sb, "v1", { dates: ["2027-05-01"], status: "free" });
    expect(called("vendor_availability", "delete")).toHaveLength(1);
    expect(called("vendor_availability", "upsert")).toHaveLength(0);
  });

  it("reports database errors", async () => {
    const bad = mockSb({ vendor_availability: { error: { message: "rls" } } });
    expect(await setAvailability(bad.sb, "v1", { dates: ["2027-05-01"], status: "blocked" })).toEqual({ ok: false, error: "rls" });
    expect(await setAvailability(bad.sb, "v1", { dates: ["2027-05-01"], status: "free" })).toEqual({ ok: false, error: "rls" });
  });
});

describe("saveConsultHours", () => {
  const window = { weekday: 2, startTime: "09:00", endTime: "12:00" };

  it("rejects bad times, windows that end before they start, and bad weekdays", async () => {
    const { sb, calls } = mockSb();
    expect((await saveConsultHours(sb, "v1", { hours: [{ ...window, startTime: "9am" }] })).ok).toBe(false);
    expect((await saveConsultHours(sb, "v1", { hours: [{ ...window, startTime: "13:00", endTime: "12:00" }] })).ok).toBe(false);
    expect((await saveConsultHours(sb, "v1", { hours: [{ ...window, weekday: 7 }] })).ok).toBe(false);
    expect((await saveConsultHours(sb, "v1", { hours: [], callsPerDay: 0 })).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("replaces the windows and updates only the settings that were sent", async () => {
    const { sb, called } = mockSb();
    const r = await saveConsultHours(sb, "v1", { hours: [window], callLink: " https://zoom.us/j/1 ", callsPerDay: 3 });
    expect(r).toEqual({ ok: true, data: { hours: 1 } });
    expect(called("vendor_agent_settings", "update")[0].args[0]).toEqual({ call_link: "https://zoom.us/j/1", calls_per_day: 3 });
    expect(called("consult_hours", "delete")).toHaveLength(1);
    expect(called("consult_hours", "insert")[0].args[0]).toEqual([
      { vendor_id: "v1", weekday: 2, start_time: "09:00", end_time: "12:00", timezone: "America/New_York", slot_minutes: 30 },
    ]);
  });

  it("clears everything when no windows are sent, and skips settings if none sent", async () => {
    const { sb, called, calls } = mockSb();
    await saveConsultHours(sb, "v1", { hours: [] });
    expect(called("consult_hours", "delete")).toHaveLength(1);
    expect(called("consult_hours", "insert")).toHaveLength(0);
    expect(calls.some((c) => c.table === "vendor_agent_settings")).toBe(false);
  });

  it("returns database errors", async () => {
    const bad = mockSb({ consult_hours: { error: { message: "overlap" } } });
    expect(await saveConsultHours(bad.sb, "v1", { hours: [window] })).toEqual({ ok: false, error: "overlap" });
  });
});
