import { describe, it, expect, vi } from "vitest";
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/embeddings", () => ({ refreshVendorEmbedding: vi.fn(), embedText: vi.fn() }));
import { after } from "next/server";
import { deleteAddOn, deletePackage, deleteTestimonial, updateAddOn, updatePackage } from "./vendor-profile";
import { mockSb, UUID } from "./test-utils";

describe("updatePackage", () => {
  it("rejects a bad id, a zero price, and an empty change", async () => {
    const { sb } = mockSb();
    expect((await updatePackage(sb, "v1", { id: "nope", price: 100 })).ok).toBe(false);
    expect((await updatePackage(sb, "v1", { id: UUID, price: 0 })).ok).toBe(false);
    expect(await updatePackage(sb, "v1", { id: UUID })).toEqual({ ok: false, error: "Nothing to change." });
  });

  it("changes only the fields sent, resyncs prices and re-embeds", async () => {
    vi.mocked(after).mockClear();
    const { sb, called } = mockSb({
      vendor_packages: [{ data: [{ id: UUID, name: "Signature", price: 4000 }] }, { data: [{ price: 4000 }, { price: 2000 }] }],
      vendors: { data: null },
    });
    const r = await updatePackage(sb, "v1", { id: UUID, price: 4000 });
    expect(r.ok && r.data.saved.price).toBe(4000);
    expect(called("vendor_packages", "update")[0].args[0]).toEqual({ price: 4000 });
    expect(called("vendors", "update")[0].args[0]).toEqual({ price_min: 2000, price_max: 4000 });
    expect(after).toHaveBeenCalledOnce();
  });

  it("says when the package isn't theirs, and returns database errors", async () => {
    const none = mockSb({ vendor_packages: { data: [] } });
    expect(await updatePackage(none.sb, "v1", { id: UUID, price: 5 })).toEqual({ ok: false, error: "Package not found." });
    const bad = mockSb({ vendor_packages: { error: { message: "no" } } });
    expect(await updatePackage(bad.sb, "v1", { id: UUID, price: 5 })).toEqual({ ok: false, error: "no" });
  });
});

describe("deletePackage", () => {
  it("won't remove the only package of a live listing", async () => {
    const { sb, called } = mockSb({ vendors: { data: { id: "v1", published: true, vendor_packages: [{ id: UUID }] } } });
    const r = await deletePackage(sb, "v1", { id: UUID });
    expect(r.ok).toBe(false);
    expect(called("vendor_packages", "delete")).toHaveLength(0);
  });

  it("deletes it when the listing is a draft, or has other packages", async () => {
    const { sb } = mockSb({
      vendors: { data: { id: "v1", published: true, vendor_packages: [{}, {}] } },
      vendor_packages: [{ data: [{ id: UUID }] }, { data: [{ price: 2000 }] }],
    });
    expect(await deletePackage(sb, "v1", { id: UUID })).toEqual({ ok: true, data: { deleted: UUID } });
  });

  it("says when nothing was deleted", async () => {
    const { sb } = mockSb({ vendors: { data: { published: false, vendor_packages: [] } }, vendor_packages: { data: [] } });
    expect(await deletePackage(sb, "v1", { id: UUID })).toEqual({ ok: false, error: "Package not found." });
  });
});

describe("add-ons and reviews", () => {
  it("updateAddOn allows a free add-on but not a negative price", async () => {
    const good = mockSb({ vendor_addons: { data: [{ id: UUID, name: "Hour", price: 0 }] } });
    expect((await updateAddOn(good.sb, "v1", { id: UUID, price: 0 })).ok).toBe(true);
    expect((await updateAddOn(good.sb, "v1", { id: UUID, price: -1 })).ok).toBe(false);
  });

  it("deleteAddOn and deleteTestimonial report missing rows", async () => {
    const none = mockSb({ vendor_addons: { data: [] }, testimonials: { data: [] } });
    expect(await deleteAddOn(none.sb, "v1", { id: UUID })).toEqual({ ok: false, error: "Add-on not found." });
    // RLS only lets a vendor delete unverified reviews, so a verified one looks like "not found".
    expect(await deleteTestimonial(none.sb, "v1", { id: UUID })).toEqual({ ok: false, error: "Review not found." });
  });

  it("deletes a review", async () => {
    const { sb, called } = mockSb({ testimonials: { data: [{ id: UUID }] } });
    expect(await deleteTestimonial(sb, "v1", { id: UUID })).toEqual({ ok: true, data: { deleted: UUID } });
    expect(called("testimonials", "eq").map((c) => c.args)).toContainEqual(["vendor_id", "v1"]);
  });
});
