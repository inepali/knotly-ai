import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { checkoutSessionBody } from "./stripe";

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
