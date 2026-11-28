import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWalletAlert, walletAlertEmail } from "./wallet-alerts";

const pricing = { lead_fee_cents: 100, reload_below_cents: 1000 };
const admin = (kind: unknown, email: string | null = "v@b.co") =>
  ({
    rpc: (name: string) => Promise.resolve({ data: name === "take_wallet_alert" ? kind : pricing, error: null }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: email ? { email } : null }) }) }) }),
  }) as unknown as SupabaseClient;

describe("sendWalletAlert", () => {
  it("emails the low-balance alert", async () => {
    const send = vi.fn<(to: string, subject: string, text: string, link: string) => Promise<unknown>>(async () => ({}));
    expect(await sendWalletAlert(admin("low"), "v1", send)).toBe("low");
    expect(send).toHaveBeenCalledWith("v@b.co", "Your Knotly balance is under $10", expect.stringMatching(/reload now/), expect.stringMatching(/\/vendor\/dashboard\/account$/));
  });

  it("emails the paused alert", async () => {
    const send = vi.fn<(to: string, subject: string, text: string, link: string) => Promise<unknown>>(async () => ({}));
    expect(await sendWalletAlert(admin("empty"), "v1", send)).toBe("empty");
    expect(send.mock.calls[0][1]).toBe("New leads are paused");
  });

  it("sends nothing when no alert is due", async () => {
    const send = vi.fn(async () => ({}));
    expect(await sendWalletAlert(admin(null), "v1", send)).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it("never throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const send = vi.fn(async () => {
      throw new Error("resend down");
    });
    expect(await sendWalletAlert(admin("low"), "v1", send)).toBeNull();
  });
});

describe("walletAlertEmail", () => {
  it("uses the configured amounts", () => {
    expect(walletAlertEmail("empty", { lead_fee_cents: 150, reload_below_cents: 1000 }).text).toMatch(/\$1\.50 lead fee/);
  });
});
