import { describe, it, expect } from "vitest";
import { betterBundle, buildCart, formatUsd, type CatalogItem } from "./addons";

const item = (key: string, price: number, requires: string[] = []): CatalogItem => ({
  key, name: key, blurb: "", price_cents: price, kind: "one_time", includes: [], requires, active: true, sort: 0,
});
const bundle = (key: string, price: number, includes: string[]): CatalogItem => ({
  key, name: key, blurb: "", price_cents: price, kind: "bundle", includes, requires: [], active: true, sort: 0,
});
const CATALOG = [
  item("website", 500),
  item("rsvp", 500, ["website"]),
  item("registry", 500, ["website"]),
  item("invitations", 500),
  item("seating", 500),
  bundle("bundle_essentials", 1500, ["website", "rsvp", "registry", "invitations"]),
  { ...item("retired", 500), active: false },
];

describe("buildCart", () => {
  it("adds what an add-on needs and says so", () => {
    const r = buildCart(CATALOG, ["rsvp"], []);
    expect(r.ok && r.cart.keys).toEqual(["website", "rsvp"]);
    expect(r.ok && r.cart.addedForYou).toEqual(["website"]);
    expect(r.ok && r.cart.total_cents).toBe(1000);
  });

  it("drops what the couple already owns", () => {
    const r = buildCart(CATALOG, ["rsvp"], ["website"]);
    expect(r.ok && r.cart.keys).toEqual(["rsvp"]);
    expect(r.ok && r.cart.total_cents).toBe(500);
  });

  it("refuses an add-on that's already owned, unknown or retired", () => {
    expect(buildCart(CATALOG, ["website"], ["website"]).ok).toBe(false);
    expect(buildCart(CATALOG, ["nope"], []).ok).toBe(false);
    expect(buildCart(CATALOG, ["retired"], []).ok).toBe(false);
    expect(buildCart(CATALOG, [], []).ok).toBe(false);
  });

  it("doesn't double-count a shared requirement", () => {
    const r = buildCart(CATALOG, ["rsvp", "registry"], []);
    expect(r.ok && r.cart.keys).toEqual(["website", "rsvp", "registry"]);
  });

  it("credits a bundle for what's owned, never below zero", () => {
    const r = buildCart(CATALOG, ["bundle_essentials"], ["website", "rsvp"]);
    expect(r.ok && r.cart.total_cents).toBe(500);
    expect(r.ok && r.cart.keys).toEqual(["bundle_essentials"]);
    const all = buildCart(CATALOG, ["bundle_essentials"], ["website", "rsvp", "registry", "invitations"]);
    expect(all.ok).toBe(false);
  });

  it("won't mix a bundle with other add-ons", () => {
    expect(buildCart(CATALOG, ["bundle_essentials", "seating"], []).ok).toBe(false);
  });
});

describe("betterBundle", () => {
  it("offers a bundle when it's cheaper than the pieces", () => {
    const r = buildCart(CATALOG, ["rsvp", "registry", "invitations"], []);
    expect(r.ok && betterBundle(CATALOG, r.cart, [])).toEqual({ key: "bundle_essentials", total_cents: 1500 });
  });

  it("stays quiet when the bundle isn't cheaper or doesn't cover the cart", () => {
    const small = buildCart(CATALOG, ["rsvp"], []);
    expect(small.ok && betterBundle(CATALOG, small.cart, [])).toBeNull();
    const seating = buildCart(CATALOG, ["seating", "rsvp", "registry", "invitations"], []);
    expect(seating.ok && betterBundle(CATALOG, seating.cart, [])).toBeNull();
  });
});

describe("formatUsd", () => {
  it("drops .00 and keeps cents", () => {
    expect(formatUsd(500)).toBe("$5");
    expect(formatUsd(1550)).toBe("$15.50");
  });
});
