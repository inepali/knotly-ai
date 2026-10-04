// src/agent/vendor/fixtures.ts
import type { VendorCtx } from "./context";
import type { Decision } from "./decide";

export function makeCtx(o: Partial<VendorCtx> = {}): VendorCtx {
  return {
    threadId: "t1",
    paused: false,
    vendor: {
      id: "v1",
      business_name: "Golden Hour Co.",
      category: "photographer",
      bio: "Candid, film look.",
      metro_slug: "charlotte-nc",
      price_min: 3200,
    },
    settings: {
      vendor_id: "v1",
      autonomy_level: 2,
      confidence_threshold: 0.7,
      hold_days: 3,
      quote_valid_days: 14,
      signature: null,
      holding_reply: "Thanks!",
    },
    rules: [
      { kind: "price_floor", amount: 2800 },
      { kind: "max_discount", percent: 10 },
      { kind: "always_review", field: "guest_count", op: ">", value: 250 },
      { kind: "service_radius", miles: 75 },
    ],
    packages: [
      {
        id: "essential",
        name: "Essential",
        description: null,
        price: 3200,
        inclusions: ["6 hours"],
      },
      {
        id: "signature",
        name: "Signature",
        description: null,
        price: 4800,
        inclusions: ["8 hours", "second shooter"],
      },
    ],
    addOns: [{ id: "extra-hour", name: "Extra hour", description: null, price: 400 }],
    knowledge: [],
    wedding: {
      wedding_date: "2027-10-16",
      metro_slug: "charlotte-nc",
      guest_count: 150,
      budget_total: 40000,
      style: "boho",
    },
    dateStatus: "open",
    distanceMiles: 0,
    daysUntilWedding: 380,
    history: [
      {
        from: "couple_agent",
        text: "Hi! Could we get an estimate for 8 hours?",
      },
    ],
    lastCoupleMessage: "Hi! Could we get an estimate for 8 hours?",
    ...o,
  } as VendorCtx;
}

export const quote = (
  packageId: string,
  discountPercent = 0,
  extra: Partial<Decision> = {}
): Decision => ({
  responseType: "quote",
  message: "Happy to help!",
  confidence: 0.9,
  sources: [`package:${packageId}`],
  quote: { packageId, addOnIds: [], discountPercent },
  escalationReason: null,
  ...extra,
});
