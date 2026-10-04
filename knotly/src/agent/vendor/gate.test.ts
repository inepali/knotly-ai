// src/agent/vendor/gate.test.ts
import { describe, it, expect } from "vitest";
import { gate } from "./gate";
import { priceQuote } from "./pricing";
import { makeCtx, quote } from "./fixtures";

const run = (d: ReturnType<typeof quote>, ctx = makeCtx()) =>
  gate(d, ctx, priceQuote(d, ctx));

describe("policy gate", () => {
  it("sends a normal estimate at level 2", () => {
    expect(run(quote("signature")).pass).toBe(true);
  });
  it("escalates everything at level 0 (Shadow)", () => {
    const ctx = makeCtx({
      settings: { ...makeCtx().settings, autonomy_level: 0 },
    });
    expect(run(quote("signature"), ctx).violations).toContain("autonomy_level");
  });
  it("blocks a total under the price floor", () => {
    const ctx = makeCtx({
      packages: [
        {
          id: "mini",
          name: "Mini",
          description: null,
          price: 2000,
          inclusions: [],
        },
      ],
    });
    expect(run(quote("mini"), ctx).violations).toContain("price_floor");
  });
  it("needs level 3 for any discount, and never above the max", () => {
    expect(run(quote("signature", 5)).violations).toContain(
      "discount_needs_level_3"
    );
    const l3 = makeCtx({
      settings: { ...makeCtx().settings, autonomy_level: 3 },
    });
    expect(run(quote("signature", 5), l3).pass).toBe(true);
    expect(run(quote("signature", 20), l3).violations).toContain(
      "max_discount"
    );
  });
  it("blocks invented packages", () => {
    expect(run(quote("platinum-deluxe")).violations).toContain(
      "invalid_package"
    );
  });
  it("respects always-review, calendar, and service area", () => {
    expect(
      run(
        quote("signature"),
        makeCtx({ wedding: { ...makeCtx().wedding, guest_count: 300 } })
      ).violations
    ).toContain("always_review");
    expect(
      run(quote("signature"), makeCtx({ dateStatus: "full" })).violations
    ).toContain("date_unavailable");
    expect(
      run(quote("signature"), makeCtx({ distanceMiles: 140 })).violations
    ).toContain("service_area");
  });
  it("escalates sensitive messages and human claims", () => {
    expect(
      run(
        quote("signature"),
        makeCtx({ lastCoupleMessage: "We want a refund" })
      ).violations
    ).toContain("sensitive");
    expect(
      run(quote("signature", 0, { message: "I'm a real person, promise!" }))
        .violations
    ).toContain("human_claim");
  });
  it("escalates low confidence even when rules pass", () => {
    expect(
      run(quote("signature", 0, { confidence: 0.4 })).violations
    ).toContain("low_confidence");
  });
});
