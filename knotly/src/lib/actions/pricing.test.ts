import { describe, it, expect } from "vitest";
import { centsToDollars, dollarsToCents, loadPricing, removeMetroPricing, savePricing } from "./pricing";
import { mockSb } from "./test-utils";

const valid = {
  metroSlug: null,
  leadFeeCents: 100,
  reloadStepCents: 2000,
  reloadMaxSteps: 5,
  reloadBelowCents: 1000,
  signupCreditCents: 1000,
  smsFreeMonthly: 50,
  smsOverageCents: 20,
};

describe("savePricing", () => {
  it("updates the default row and records who", async () => {
    const { sb, called } = mockSb({ pricing_config: {} });
    expect(await savePricing(sb, "admin1", valid)).toEqual({ ok: true, data: { saved: "default" } });
    const patch = called("pricing_config", "update")[0].args[0] as Record<string, unknown>;
    expect(patch).toMatchObject({ lead_fee_cents: 100, reload_below_cents: 1000, sms_free_monthly: 50, updated_by: "admin1" });
    expect(called("pricing_config", "is")[0].args).toEqual(["metro_slug", null]);
  });

  it("upserts a metro override", async () => {
    const { sb, called } = mockSb({ metros: { data: { slug: "charlotte-nc" } }, pricing_config: {} });
    expect(await savePricing(sb, "admin1", { ...valid, metroSlug: "charlotte-nc", leadFeeCents: 150 })).toEqual({ ok: true, data: { saved: "charlotte-nc" } });
    expect(called("pricing_config", "upsert")[0].args[0]).toMatchObject({ metro_slug: "charlotte-nc", lead_fee_cents: 150 });
  });

  it("refuses an unknown metro", async () => {
    const { sb } = mockSb({ metros: { data: null } });
    expect(await savePricing(sb, "admin1", { ...valid, metroSlug: "atlantis" })).toEqual({ ok: false, error: "That metro doesn't exist." });
  });

  it("refuses values the database would refuse", async () => {
    const { sb } = mockSb();
    expect((await savePricing(sb, "a", { ...valid, leadFeeCents: -1 })).ok).toBe(false);
    expect((await savePricing(sb, "a", { ...valid, reloadMaxSteps: 0 })).ok).toBe(false);
    expect((await savePricing(sb, "a", { ...valid, reloadStepCents: 50 })).ok).toBe(false);
    expect((await savePricing(sb, "a", { ...valid, leadFeeCents: 1.5 })).ok).toBe(false);
    const big = await savePricing(sb, "a", { ...valid, reloadStepCents: 50_000, reloadMaxSteps: 3 });
    expect(big).toEqual({ ok: false, error: "reloadMaxSteps: The largest reload (step × max) can't be over $1,000." });
  });
});

describe("removeMetroPricing", () => {
  it("deletes only that metro's row", async () => {
    const { sb, called } = mockSb({ pricing_config: {} });
    expect(await removeMetroPricing(sb, { metroSlug: "charlotte-nc" })).toEqual({ ok: true, data: { removed: "charlotte-nc" } });
    expect(called("pricing_config", "eq")[0].args).toEqual(["metro_slug", "charlotte-nc"]);
  });
});

describe("loadPricing", () => {
  it("lists metros that have no override yet", async () => {
    const { sb } = mockSb({
      pricing_config: { data: [{ metro_slug: null }, { metro_slug: "charlotte-nc" }] },
      metros: { data: [{ slug: "charlotte-nc", name: "Charlotte", state: "NC" }, { slug: "raleigh-nc", name: "Raleigh", state: "NC" }] },
    });
    const r = await loadPricing(sb);
    expect(r.metrosWithoutOverride.map((m) => m.slug)).toEqual(["raleigh-nc"]);
  });
});

describe("dollars and cents", () => {
  it("converts what the admin types", () => {
    expect(dollarsToCents("1")).toBe(100);
    expect(dollarsToCents("$12.50")).toBe(1250);
    expect(dollarsToCents("0.2")).toBe(20);
    expect(Number.isNaN(dollarsToCents("1.234"))).toBe(true);
    expect(Number.isNaN(dollarsToCents("abc"))).toBe(true);
    expect(centsToDollars(1250)).toBe("12.50");
  });
});
