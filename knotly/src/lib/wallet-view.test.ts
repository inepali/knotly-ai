import { describe, it, expect } from "vitest";
import { activityLabel, filterKey, leadsLeft, needsReload, pageNumber, reloadChoices, signedUsd } from "./wallet-view";

describe("wallet-view", () => {
  it("labels each kind of ledger row", () => {
    const base = { note: null, couple_first_name: null, wedding_month: null };
    expect(activityLabel({ ...base, kind: "estimate_view", couple_first_name: "Priya", wedding_month: "Oct 2027" })).toBe("Lead: Priya · Oct 2027");
    expect(activityLabel({ ...base, kind: "estimate_view" })).toBe("Lead: a couple opened your estimate");
    expect(activityLabel({ ...base, kind: "promo", note: "signup" })).toBe("Signup credit");
    expect(activityLabel({ ...base, kind: "adjust", note: "goodwill" })).toBe("Adjustment: goodwill");
    expect(activityLabel({ ...base, kind: "lead_credit" })).toBe("Spam lead credited back");
    expect(activityLabel({ ...base, kind: "topup" })).toBe("Reload");
  });

  it("counts leads left and formats amounts", () => {
    expect(leadsLeft({ available_cents: 950, lead_fee_cents: 100 })).toBe(9);
    expect(leadsLeft({ available_cents: -5, lead_fee_cents: 100 })).toBe(0);
    expect(signedUsd(2000)).toBe("+$20.00");
    expect(signedUsd(-100)).toBe("−$1.00");
  });

  it("offers $20 steps up to the max", () => {
    expect(reloadChoices({ reload_step_cents: 2000, reload_max_steps: 5 }).map((c) => c.label)).toEqual(["$20", "$40", "$60", "$80", "$100"]);
  });

  it("shows the nav dot only for Pay-as-you-go vendors under the threshold", () => {
    expect(needsReload({ plan: "payg", available_cents: 900, reload_below_cents: 1000 })).toBe(true);
    expect(needsReload({ plan: "payg", available_cents: 1000, reload_below_cents: 1000 })).toBe(false);
    expect(needsReload({ plan: "basic", available_cents: 0, reload_below_cents: 1000 })).toBe(false);
    expect(needsReload(null)).toBe(false);
  });

  it("sanitizes the filter and page from the URL", () => {
    expect(filterKey("leads")).toBe("leads");
    expect(filterKey("drop table")).toBe("");
    expect(pageNumber("3")).toBe(3);
    expect(pageNumber("-2")).toBe(1);
    expect(pageNumber("abc")).toBe(1);
  });
});
