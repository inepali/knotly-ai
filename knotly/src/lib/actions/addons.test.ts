import { describe, it, expect, vi } from "vitest";
import { quoteAddons, startAddonCheckout } from "./addons";
import { mockSb } from "./test-utils";

const catalog = [
  { key: "website", name: "Wedding Website", blurb: "", price_cents: 500, kind: "one_time", includes: [], requires: [], active: true, sort: 1 },
  { key: "rsvp", name: "RSVP", blurb: "", price_cents: 500, kind: "one_time", includes: [], requires: ["website"], active: true, sort: 2 },
];
const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

const db = (owned: unknown[] = []) =>
  mockSb({
    couple_projects: { data: { id: "p1" } },
    addon_catalog: { data: catalog },
    couple_addons: { data: owned },
    profiles: { data: { email: "a@b.co" } },
  });

describe("quoteAddons", () => {
  it("needs a wedding first", async () => {
    const { sb } = mockSb({ couple_projects: { data: null } });
    expect((await quoteAddons(sb, "u1", { keys: ["website"] })).ok).toBe(false);
  });

  it("treats an expired add-on as not owned", async () => {
    const r = await quoteAddons(db([{ addon_key: "website", active_until: past, source: "purchase" }]).sb, "u1", { keys: ["rsvp"] });
    expect(r.ok && r.data.cart.keys).toEqual(["website", "rsvp"]);
    const r2 = await quoteAddons(db([{ addon_key: "website", active_until: future, source: "purchase" }]).sb, "u1", { keys: ["rsvp"] });
    expect(r2.ok && r2.data.cart.keys).toEqual(["rsvp"]);
  });
});

describe("startAddonCheckout", () => {
  it("prices on the server and sends the couple to Stripe", async () => {
    const createSession = vi.fn().mockResolvedValue({ ok: true, url: "https://checkout.stripe.com/x" });
    const r = await startAddonCheckout(db().sb, "u1", { keys: ["rsvp"], price: 1 }, { createSession, siteUrl: "https://knotly.net" });
    expect(r).toEqual({ ok: true, data: { url: "https://checkout.stripe.com/x" } });
    const arg = createSession.mock.calls[0][0];
    expect(arg.cart.total_cents).toBe(1000);
    expect(arg.projectId).toBe("p1");
    expect(arg.email).toBe("a@b.co");
    expect(arg.successUrl).toBe("https://knotly.net/client/dashboard/add-ons?unlocked=website%2Crsvp");
  });

  it("passes on Stripe failures", async () => {
    const createSession = vi.fn().mockResolvedValue({ ok: false, error: "nope" });
    expect(await startAddonCheckout(db().sb, "u1", { keys: ["website"] }, { createSession, siteUrl: "x" })).toEqual({ ok: false, error: "nope" });
  });
});
