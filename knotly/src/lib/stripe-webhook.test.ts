import { describe, it, expect, vi } from "vitest";
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

  it("credits a paid wallet reload with the pre-tax amount", async () => {
    const reload = {
      id: "evt_w1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_w1",
          payment_status: "paid",
          payment_intent: "pi_w1",
          amount_subtotal: 4000,
          amount_total: 4280,
          metadata: { type: "wallet_reload", vendor_id: "v1", amount_cents: "4000" },
        },
      },
    };
    const { sb, calls } = mockSb({ stripe_events: {} }, { data: true });
    expect(await handleStripeEvent(sb, reload)).toBe("credited");
    expect(calls.find((c) => c.table === "rpc:credit_wallet")?.args[0]).toEqual({
      p_vendor: "v1",
      p_cents: 4000,
      p_session: "cs_w1",
      p_intent: "pi_w1",
    });
    expect(calls.some((c) => c.table === "rpc:grant_addons")).toBe(false);

    const failed = mockSb({ stripe_events: {} }, { error: { message: "invalid reload amount" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await handleStripeEvent(failed.sb, reload)).toBe("error");
  });

  it("takes back a refunded wallet reload, partial refunds included", async () => {
    const refund = { id: "evt_w2", type: "charge.refunded", data: { object: { payment_intent: "pi_w1", amount: 4280, amount_refunded: 2140 } } };
    const { sb, calls } = mockSb({ stripe_events: {} }, { data: 2000 });
    expect(await handleStripeEvent(sb, refund)).toBe("debited");
    expect(calls.find((c) => c.table === "rpc:refund_wallet_payment")?.args[0]).toEqual({
      p_intent: "pi_w1",
      p_amount: 4280,
      p_refunded: 2140,
    });
    expect(calls.some((c) => c.table === "rpc:revoke_addons_for_payment")).toBe(false);
  });
});
