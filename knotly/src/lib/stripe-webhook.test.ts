import { describe, it, expect } from "vitest";
import { handleStripeEvent } from "./stripe-webhook";
import { mockSb } from "./actions/test-utils";

const paid = {
  id: "evt_1",
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_1",
      payment_status: "paid",
      payment_intent: "pi_1",
      amount_total: 1065,
      total_details: { amount_tax: 65 },
      client_reference_id: "p1",
      metadata: { project_id: "p1", keys: "website,rsvp" },
    },
  },
};

describe("handleStripeEvent", () => {
  it("grants the add-ons from a paid checkout", async () => {
    const { sb, calls } = mockSb({ stripe_events: {} });
    expect(await handleStripeEvent(sb, paid)).toBe("granted");
    expect(calls.find((c) => c.table === "rpc:grant_addons")?.args[0]).toEqual({
      p_project: "p1",
      p_keys: ["website", "rsvp"],
      p_session: "cs_1",
      p_intent: "pi_1",
      p_amount: 1065,
      p_tax: 65,
    });
  });

  it("ignores a repeat delivery", async () => {
    const { sb, calls } = mockSb({ stripe_events: { error: { message: "duplicate key value" } } });
    expect(await handleStripeEvent(sb, paid)).toBe("duplicate");
    expect(calls.some((c) => c.table.startsWith("rpc:"))).toBe(false);
  });

  it("waits for unpaid (async) checkouts", async () => {
    const { sb } = mockSb({ stripe_events: {} });
    const e = { ...paid, data: { object: { ...paid.data.object, payment_status: "unpaid" } } };
    expect(await handleStripeEvent(sb, e)).toBe("ignored");
  });

  it("revokes on a full refund only", async () => {
    const full = { id: "evt_2", type: "charge.refunded", data: { object: { payment_intent: "pi_1", amount: 1065, amount_refunded: 1065 } } };
    const a = mockSb({ stripe_events: {} });
    expect(await handleStripeEvent(a.sb, full)).toBe("revoked");
    expect(a.calls.find((c) => c.table === "rpc:revoke_addons_for_payment")?.args[0]).toEqual({ p_intent: "pi_1" });

    const partial = { ...full, id: "evt_3", data: { object: { ...full.data.object, amount_refunded: 500 } } };
    expect(await handleStripeEvent(mockSb({ stripe_events: {} }).sb, partial)).toBe("ignored");
  });

  it("reports a failed grant so Stripe retries", async () => {
    const { sb } = mockSb({ stripe_events: {} }, { error: { message: "boom" } });
    expect(await handleStripeEvent(sb, paid)).toBe("error");
  });
});
