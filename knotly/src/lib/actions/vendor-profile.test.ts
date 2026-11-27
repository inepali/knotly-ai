import { describe, it, expect, vi } from "vitest";
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/embeddings", () => ({ refreshVendorEmbedding: vi.fn(), embedText: vi.fn() }));
import { after } from "next/server";
import {
  getMyBusiness,
  publishProfile,
  saveAddOns,
  saveBusinessProfile,
  savePackages,
} from "./vendor-profile";
import { mockSb } from "./test-utils";

const pkg = { name: "Signature", price: 3000 };

describe("saveBusinessProfile", () => {
  it("rejects bad input", async () => {
    const { sb } = mockSb();
    expect((await saveBusinessProfile(sb, "v1", { website: "not a url" })).ok).toBe(false);
    expect((await saveBusinessProfile(sb, "v1", { category: "unicorns" })).ok).toBe(false);
    expect((await saveBusinessProfile(sb, "v1", { bio: "x".repeat(1501) })).ok).toBe(false);
  });

  it("needs a name and category to create a profile", async () => {
    const { sb } = mockSb({ vendors: { data: null } });
    expect(await saveBusinessProfile(sb, "v1", { bio: "hi" })).toEqual({
      ok: false,
      error: "Need the business name and category first.",
    });
  });

  it("errors when the metro isn't served", async () => {
    const { sb } = mockSb({ vendors: { data: { id: "v1" } }, metros: { data: null } });
    const r = await saveBusinessProfile(sb, "v1", { metro: "Atlantis" });
    expect(r).toEqual({ ok: false, error: "We're not in Atlantis yet." });
  });

  it("returns the database error and doesn't re-embed", async () => {
    vi.mocked(after).mockClear();
    const { sb } = mockSb({ vendors: [{ data: { id: "v1" } }, { error: { message: "bad" } }] });
    expect(await saveBusinessProfile(sb, "v1", { bio: "hi" })).toEqual({ ok: false, error: "bad" });
    expect(after).not.toHaveBeenCalled();
  });

  it("updates an existing profile and schedules a re-embed", async () => {
    vi.mocked(after).mockClear();
    const { sb, called } = mockSb({ vendors: { data: { id: "v1" } } });
    const r = await saveBusinessProfile(sb, "v1", { bio: "hi" });
    expect(r.ok).toBe(true);
    expect(called("vendors", "update")[0].args[0]).toEqual({ bio: "hi" });
    expect(after).toHaveBeenCalledOnce();
  });
});

describe("savePackages", () => {
  it("rejects empty, too many, and non-positive prices", async () => {
    const { sb } = mockSb();
    expect((await savePackages(sb, "v1", { packages: [] })).ok).toBe(false);
    expect((await savePackages(sb, "v1", { packages: Array(11).fill(pkg) })).ok).toBe(false);
    expect((await savePackages(sb, "v1", { packages: [{ name: "Free", price: 0 }] })).ok).toBe(false);
  });

  it("needs a business profile first", async () => {
    const { sb } = mockSb({ vendors: { data: null } });
    expect(await savePackages(sb, "v1", { packages: [pkg] })).toEqual({
      ok: false,
      error: "Create the business profile first.",
    });
  });

  it("saves packages (defaulting inclusions) and syncs the price range", async () => {
    const { sb, called } = mockSb({
      vendors: { data: { id: "v1" } },
      vendor_packages: [{ data: [{ id: "k1", name: "Signature", price: 3000 }] }, { data: [{ price: 3000 }, { price: 5000 }] }],
    });
    const r = await savePackages(sb, "v1", { packages: [pkg] });
    expect(r.ok).toBe(true);
    expect(called("vendor_packages", "insert")[0].args[0]).toEqual([
      { name: "Signature", price: 3000, inclusions: [], vendor_id: "v1" },
    ]);
    expect(called("vendors", "update").some((c) => JSON.stringify(c.args[0]) === '{"price_min":3000,"price_max":5000}')).toBe(true);
  });

  it("returns the database error", async () => {
    const { sb } = mockSb({ vendors: { data: { id: "v1" } }, vendor_packages: { error: { message: "no" } } });
    expect(await savePackages(sb, "v1", { packages: [pkg] })).toEqual({ ok: false, error: "no" });
  });
});

describe("saveAddOns", () => {
  it("rejects negative prices, and needs a profile", async () => {
    expect((await saveAddOns(mockSb().sb, "v1", { addOns: [{ name: "Hour", price: -1 }] })).ok).toBe(false);
    const { sb } = mockSb({ vendors: { data: null } });
    expect((await saveAddOns(sb, "v1", { addOns: [{ name: "Hour", price: 100 }] })).ok).toBe(false);
  });

  it("saves, and returns database errors", async () => {
    const good = mockSb({ vendors: { data: { id: "v1" } }, vendor_addons: { data: [{ id: "a1" }] } });
    expect((await saveAddOns(good.sb, "v1", { addOns: [{ name: "Hour", price: 0 }] })).ok).toBe(true);
    const bad = mockSb({ vendors: { data: { id: "v1" } }, vendor_addons: { error: { message: "no" } } });
    expect(await saveAddOns(bad.sb, "v1", { addOns: [{ name: "Hour", price: 0 }] })).toEqual({ ok: false, error: "no" });
  });
});

describe("publishProfile", () => {
  it("requires a boolean", async () => {
    expect((await publishProfile(mockSb().sb, "v1", { publish: "yes" })).ok).toBe(false);
  });

  it("needs a profile", async () => {
    const { sb } = mockSb({ vendors: { data: null } });
    expect(await publishProfile(sb, "v1", { publish: true })).toEqual({ ok: false, error: "No profile yet." });
  });

  it("won't publish for a guest", async () => {
    const { sb } = mockSb({ vendors: { data: { id: "v1", vendor_packages: [{}] } } });
    const r = await publishProfile(sb, "v1", { publish: true }, { isGuest: true });
    expect(r.ok).toBe(false);
  });

  it("won't publish without a package, but will unpublish", async () => {
    const { sb } = mockSb({ vendors: { data: { id: "v1", vendor_packages: [] } } });
    expect(await publishProfile(sb, "v1", { publish: true })).toEqual({
      ok: false,
      error: "Add at least one package first.",
    });
    expect(await publishProfile(sb, "v1", { publish: false })).toEqual({ ok: true, data: { published: false } });
  });

  it("publishes a complete profile", async () => {
    const { sb, called } = mockSb({ vendors: { data: { id: "v1", vendor_packages: [{}] } } });
    expect(await publishProfile(sb, "v1", { publish: true })).toEqual({ ok: true, data: { published: true } });
    expect(called("vendors", "update")[0].args[0]).toEqual({ published: true });
  });
});

describe("getMyBusiness", () => {
  it("returns {empty:true} without a profile", async () => {
    const { sb } = mockSb({ vendors: { data: null } });
    expect(await getMyBusiness(sb, "v1")).toEqual({ ok: true, data: { empty: true } });
  });
});
