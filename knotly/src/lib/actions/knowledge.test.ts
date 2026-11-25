import { describe, it, expect, vi } from "vitest";
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/embeddings", () => ({ refreshVendorEmbedding: vi.fn(), embedText: vi.fn() }));
vi.mock("@/lib/knowledge", () => ({
  ingestKnowledge: vi.fn(),
  searchKnowledge: vi.fn(),
  kindOfUrl: () => "website",
  parsePublicUrl: (u: string) => {
    try {
      const url = new URL(u);
      return url.hostname === "localhost" ? null : url;
    } catch {
      return null;
    }
  },
}));
import { after } from "next/server";
import { searchKnowledge } from "@/lib/knowledge";
import { addKnowledge, askVendorKnowledge } from "./knowledge";
import { mockSb, UUID } from "./test-utils";

describe("addKnowledge", () => {
  it("needs a business profile first", async () => {
    const { sb } = mockSb({ vendors: { data: null } });
    expect(await addKnowledge(sb, "v1", { url: "https://example.com" })).toEqual({
      ok: false,
      error: "Create the business profile first.",
    });
  });

  it("rejects non-public addresses", async () => {
    const { sb } = mockSb({ vendors: { data: { id: "v1" } } });
    expect(await addKnowledge(sb, "v1", { url: "http://localhost:3000" })).toEqual({
      ok: false,
      error: "That isn't a public web address.",
    });
  });

  it("needs a link, or both a question and an answer", async () => {
    const { sb } = mockSb({ vendors: { data: { id: "v1" } } });
    expect((await addKnowledge(sb, "v1", {})).ok).toBe(false);
    expect((await addKnowledge(sb, "v1", { question: "Do you travel?" })).ok).toBe(false);
  });

  it("adds a link and schedules ingestion", async () => {
    vi.mocked(after).mockClear();
    const { sb, called } = mockSb({
      vendors: { data: { id: "v1" } },
      vendor_knowledge: { data: { id: "k1", kind: "website" } },
    });
    const r = await addKnowledge(sb, "v1", { url: "https://example.com/faq" });
    expect(r.ok && r.data.added).toBe("website");
    expect(called("vendor_knowledge", "insert")[0].args[0]).toMatchObject({
      kind: "website",
      status: "pending",
      vendor_id: "v1",
    });
    expect(after).toHaveBeenCalledOnce();
  });

  it("adds an FAQ", async () => {
    const { sb, called } = mockSb({
      vendors: { data: { id: "v1" } },
      vendor_knowledge: { data: { id: "k1", kind: "faq" } },
    });
    await addKnowledge(sb, "v1", { question: "Do you travel?", answer: "Yes, anywhere in NC." });
    expect(called("vendor_knowledge", "insert")[0].args[0]).toMatchObject({ kind: "faq", title: "Do you travel?" });
  });

  it("returns the database error without scheduling ingestion", async () => {
    vi.mocked(after).mockClear();
    const { sb } = mockSb({ vendors: { data: { id: "v1" } }, vendor_knowledge: { error: { message: "no" } } });
    expect(await addKnowledge(sb, "v1", { url: "https://example.com" })).toEqual({ ok: false, error: "no" });
    expect(after).not.toHaveBeenCalled();
  });
});

describe("askVendorKnowledge", () => {
  it("rejects a vendor id that isn't a uuid", async () => {
    const r = await askVendorKnowledge(mockSb().sb, "u1", { vendorId: "nope", question: "?" });
    expect(r).toEqual({ ok: false, error: "Use the vendor's id from searchVendors." });
  });

  it("rejects missing fields", async () => {
    expect((await askVendorKnowledge(mockSb().sb, "u1", { vendorId: UUID })).ok).toBe(false);
  });

  it("says when the vendor isn't visible", async () => {
    const { sb } = mockSb({ vendors: { data: null } });
    expect(await askVendorKnowledge(sb, "u1", { vendorId: UUID, question: "?" })).toEqual({
      ok: false,
      error: "Vendor not found.",
    });
  });

  it("returns excerpts, or points to the vendor when there are none", async () => {
    const { sb } = mockSb({ vendors: { data: { business_name: "Golden Hour" } } });
    vi.mocked(searchKnowledge).mockResolvedValueOnce([{ title: "FAQ", kind: "faq", url: null, text: "We travel." }] as never);
    const hit = await askVendorKnowledge(sb, "u1", { vendorId: UUID, question: "Travel?" });
    expect(hit.ok && hit.data.excerpts).toEqual([{ from: "FAQ", url: null, text: "We travel." }]);

    vi.mocked(searchKnowledge).mockResolvedValueOnce([]);
    const miss = await askVendorKnowledge(sb, "u1", { vendorId: UUID, question: "Travel?" });
    expect(miss.ok && miss.data.excerpts).toEqual([]);
    expect(miss.ok && miss.data.note).toContain("directly");
  });
});
