import { describe, it, expect } from "vitest";
import { setAvailability } from "./availability";
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

  it("deletes when freeing dates", async () => {
    const { sb, called } = mockSb();
    await setAvailability(sb, "v1", { dates: ["2027-05-01"], status: "free" });
    expect(called("vendor_availability", "delete")).toHaveLength(1);
    expect(called("vendor_availability", "upsert")).toHaveLength(0);
  });
});
