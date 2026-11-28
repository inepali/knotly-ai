import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { checkoutSessionBody, walletReloadSessionBody, NO_REFUND_NOTICE } from "./stripe";

describe("checkoutSessionBody", () => {
  it("builds Stripe's nested form fields from the cart", () => {
    const f = checkoutSessionBody({
      cart: { keys: ["website"], lines: [{ key: "website", name: "Wedding Website", amount_cents: 500 }], total_cents: 500, addedForYou: [] },
      projectId: "p1",
      email: "a@b.co",
      successUrl: "https://s",
      cancelUrl: "https://c",
    });
    expect(f.get("mode")).toBe("payment");
    expect(f.get("automatic_tax[enabled]")).toBe("true");
    expect(f.get("metadata[keys]")).toBe("website");
    expect(f.get("line_items[0][price_data][unit_amount]")).toBe("500");
    expect(f.get("line_items[0][price_data][product_data][name]")).toBe("Knotly · Wedding Website");
    expect(f.get("customer_email")).toBe("a@b.co");
  });
});

describe("walletReloadSessionBody", () => {
  it("charges $20 steps with tax on top and tags the webhook", () => {
    const f = walletReloadSessionBody({ vendorId: "v1", steps: 2, stepCents: 2000, email: "v@b.co", successUrl: "https://s", cancelUrl: "https://c" });
    expect(f.get("mode")).toBe("payment");
    expect(f.get("automatic_tax[enabled]")).toBe("true");
    expect(f.get("billing_address_collection")).toBe("required");
    expect(f.get("line_items[0][quantity]")).toBe("2");
    expect(f.get("line_items[0][price_data][unit_amount]")).toBe("2000");
    expect(f.get("line_items[0][price_data][tax_behavior]")).toBe("exclusive");
    expect(f.get("metadata[type]")).toBe("wallet_reload");
    expect(f.get("metadata[vendor_id]")).toBe("v1");
    expect(f.get("payment_intent_data[metadata][vendor_id]")).toBe("v1");
    expect(f.get("client_reference_id")).toBe("v1");
    expect(f.get("custom_text[submit][message]")).toBe(NO_REFUND_NOTICE);
  });
});
