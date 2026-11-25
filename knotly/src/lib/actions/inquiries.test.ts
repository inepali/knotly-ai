import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/embeddings", () => ({ embedText: vi.fn(async () => [0.1]), refreshVendorEmbedding: vi.fn() }));
import { draftInquiry, getVendorDetails, searchVendors } from "./inquiries";
import { mockSb, UUID } from "./test-utils";

const draft = { vendorId: UUID, subject: "  Hello  ", body: "  We'd love to book you.  " };
const project = { id: "p1", wedding_date: "2027-06-05", metro_slug: "charlotte-nc", guest_count: 120, style: "boho" };

describe("draftInquiry", () => {
  it("rejects no drafts, more than 5, and missing fields", async () => {
    const { sb } = mockSb();
    expect((await draftInquiry(sb, "u1", { drafts: [] })).ok).toBe(false);
    expect((await draftInquiry(sb, "u1", { drafts: Array(6).fill(draft) })).ok).toBe(false);
    expect((await draftInquiry(sb, "u1", { drafts: [{ vendorId: UUID }] })).ok).toBe(false);
  });

  it("refuses guests", async () => {
    const r = await draftInquiry(mockSb().sb, "u1", { drafts: [draft] }, { isGuest: true });
    expect(r.ok).toBe(false);
  });

  it("needs saved wedding details", async () => {
    const { sb } = mockSb({ couple_projects: { data: null } });
    expect(await draftInquiry(sb, "u1", { drafts: [draft] })).toEqual({
      ok: false,
      error: "Save wedding details first.",
    });
  });

  it("reports a non-uuid vendor id as failed, and fails overall if nothing saved", async () => {
    const { sb } = mockSb({ couple_projects: { data: project } });
    const r = await draftInquiry(sb, "u1", { drafts: [{ ...draft, vendorId: "nope" }] });
    expect(r).toMatchObject({ ok: false, error: "No drafts were saved.", failed: [{ vendorId: "nope" }] });
  });

  it("reports a thread that couldn't be created", async () => {
    const { sb } = mockSb({
      couple_projects: { data: project },
      threads: [{ data: null }, { data: null, error: { message: "rls" } }],
    });
    const r = await draftInquiry(sb, "u1", { drafts: [draft] });
    expect(r).toMatchObject({ ok: false, failed: [{ vendorId: UUID, error: "rls" }] });
  });

  it("returns the message insert error", async () => {
    const { sb } = mockSb({
      couple_projects: { data: project },
      threads: { data: { id: "t1", vendors: { business_name: "Golden Hour" } } },
      messages: { error: { message: "denied" } },
    });
    expect(await draftInquiry(sb, "u1", { drafts: [draft] })).toEqual({ ok: false, error: "denied" });
  });

  it("saves a trimmed pending draft with the wedding facts", async () => {
    const { sb, called } = mockSb({
      couple_projects: { data: project },
      threads: { data: { id: "t1", vendors: { business_name: "Golden Hour" } } },
      messages: { data: { id: "m1", subject: "Hello", body: "We'd love to book you." } },
    });
    const r = await draftInquiry(sb, "u1", { drafts: [draft, { ...draft, vendorId: "nope" }] });
    expect(r.ok && r.data.drafts).toEqual([
      { id: "m1", subject: "Hello", body: "We'd love to book you.", vendorName: "Golden Hour" },
    ]);
    expect(r.ok && r.data.failed).toHaveLength(1);
    expect(called("messages", "insert")[0].args[0]).toMatchObject({
      status: "pending_approval",
      subject: "Hello",
      body: "We'd love to book you.",
      payload: { type: "inquiry", weddingDate: "2027-06-05", guestCount: 120 },
    });
  });
});

describe("searchVendors", () => {
  it("rejects unknown categories, empty queries and out-of-range radius", async () => {
    const { sb } = mockSb();
    expect((await searchVendors(sb, "u1", { category: "unicorns", query: "x" })).ok).toBe(false);
    expect((await searchVendors(sb, "u1", { category: "photographer" })).ok).toBe(false);
    expect((await searchVendors(sb, "u1", { category: "photographer", query: "x", radiusMiles: 1 })).ok).toBe(false);
  });

  it("returns the RPC error", async () => {
    const { sb } = mockSb({ couple_projects: { data: null }, metros: { data: null } }, { error: { message: "rpc down" } });
    expect(await searchVendors(sb, "u1", { category: "photographer", query: "candid" })).toEqual({
      ok: false,
      error: "rpc down",
    });
  });

  it("maps results into small objects and defaults the radius", async () => {
    const row = {
      id: UUID,
      business_name: "Golden Hour",
      price_min: 2500,
      avg_rating: 4.9,
      review_count: "12",
      distance_miles: 7.4,
      similarity: 0.834,
      bio: "Candid.",
    };
    const m = mockSb(
      { couple_projects: { data: project }, metros: { data: { slug: "charlotte-nc", name: "Charlotte", lat: 35, lng: -80 } } },
      { data: [row] }
    );
    const r = await searchVendors(m.sb, "u1", { category: "photographer", query: "candid" });
    expect(r.ok && r.data.city).toBe("Charlotte");
    expect(r.ok && r.data.vendors).toEqual([
      { id: UUID, name: "Golden Hour", priceFrom: 2500, rating: 4.9, reviews: 12, miles: 7, match: 83, blurb: "Candid." },
    ]);
    expect(m.calls.find((c) => c.method === "rpc")!.args[0]).toMatchObject({ p_radius_miles: 50, p_limit: 6 });
  });
});

describe("getVendorDetails", () => {
  it("rejects a non-uuid id", async () => {
    expect((await getVendorDetails(mockSb().sb, "u1", { vendorId: "nope" })).ok).toBe(false);
  });

  it("returns the vendor or the database error", async () => {
    const good = mockSb({ vendors: { data: { id: UUID } } });
    expect(await getVendorDetails(good.sb, "u1", { vendorId: UUID })).toEqual({ ok: true, data: { vendor: { id: UUID } } });
    const bad = mockSb({ vendors: { error: { message: "not found" } } });
    expect(await getVendorDetails(bad.sb, "u1", { vendorId: UUID })).toEqual({ ok: false, error: "not found" });
  });
});
