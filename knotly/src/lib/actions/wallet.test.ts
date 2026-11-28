import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { startWalletReload, usd, type ReloadDeps } from "./wallet";

const pricing = { reload_step_cents: 2000, reload_max_steps: 5, reload_below_cents: 1000 };

function sbWith({ canReload = true, price = pricing as unknown }: { canReload?: unknown; price?: unknown } = {}) {
  return {
    rpc: (name: string) => Promise.resolve({ data: name === "can_reload" ? canReload : price, error: null }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { email: "v@b.co" } }) }) }) }),
  } as unknown as SupabaseClient;
}
const deps = () => ({
  createSession: vi.fn<ReloadDeps["createSession"]>(async () => ({ ok: true, url: "https://checkout" })),
  siteUrl: "https://knotly.net",
});

describe("startWalletReload", () => {
  it("starts checkout for $20 steps priced on the server", async () => {
    const d = deps();
    expect(await startWalletReload(sbWith(), "v1", { steps: 2 }, d)).toEqual({ ok: true, data: { url: "https://checkout" } });
    expect(d.createSession).toHaveBeenCalledWith({
      vendorId: "v1",
      steps: 2,
      stepCents: 2000,
      email: "v@b.co",
      successUrl: "https://knotly.net/vendor/dashboard/account?reloaded=1",
      cancelUrl: "https://knotly.net/vendor/dashboard/account?canceled=1",
    });
  });

  it("refuses while the balance is at or above $10", async () => {
    const d = deps();
    expect(await startWalletReload(sbWith({ canReload: false }), "v1", { steps: 1 }, d)).toEqual({
      ok: false,
      error: "You can reload when your balance drops below $10.",
    });
    expect(d.createSession).not.toHaveBeenCalled();
  });

  it("refuses more than the max per reload", async () => {
    const r = await startWalletReload(sbWith(), "v1", { steps: 6 }, deps());
    expect(r).toEqual({ ok: false, error: "The most you can add at once is $100." });
  });

  it("rejects bad input and never takes an amount from the browser", async () => {
    expect((await startWalletReload(sbWith(), "v1", { steps: 0 }, deps())).ok).toBe(false);
    expect((await startWalletReload(sbWith(), "v1", { steps: 1.5 }, deps())).ok).toBe(false);
    const d = deps();
    await startWalletReload(sbWith(), "v1", { steps: 1, amount_cents: 1 }, d);
    expect(d.createSession.mock.calls[0][0].stepCents).toBe(2000);
  });

  it("passes on a checkout failure", async () => {
    const d = { createSession: vi.fn<ReloadDeps["createSession"]>(async () => ({ ok: false, error: "We couldn't start checkout." })), siteUrl: "x" };
    expect(await startWalletReload(sbWith(), "v1", { steps: 1 }, d)).toEqual({ ok: false, error: "We couldn't start checkout." });
  });
});

describe("usd", () => {
  it("formats cents", () => {
    expect(usd(1000)).toBe("$10");
    expect(usd(150)).toBe("$1.50");
  });
});
