import { describe, expect, it } from "vitest";
import { categoryFromParam, categoryParam, jsonLdString, metaDescription, vendorJsonLd, vendorPath, type SeoVendor } from "./vendor-seo";

describe("vendor URLs", () => {
  it("builds the path from city, category and slug", () => {
    expect(vendorPath({ slug: "golden-hour-3f9a1c", metro_slug: "charlotte-nc", category: "photo_editor" })).toBe(
      "/wedding-vendors/charlotte-nc/photo-editor/golden-hour-3f9a1c"
    );
  });
  it("has no path until the vendor has a slug and a city", () => {
    expect(vendorPath({ slug: null, metro_slug: "charlotte-nc", category: "dj" })).toBeNull();
    expect(vendorPath({ slug: "x", metro_slug: null, category: "dj" })).toBeNull();
  });
  it("converts categories both ways and rejects unknown ones", () => {
    expect(categoryParam("hair_stylist")).toBe("hair-stylist");
    expect(categoryFromParam("hair-stylist")).toBe("hair_stylist");
    expect(categoryFromParam("unicorns")).toBeNull();
  });
});

describe("metaDescription", () => {
  it("uses the fallback when there is no bio", () => {
    expect(metaDescription("  ", "Fallback text")).toBe("Fallback text");
    expect(metaDescription(null, "Fallback text")).toBe("Fallback text");
  });
  it("keeps short text and tidies whitespace", () => {
    expect(metaDescription("We shoot\n\nweddings.", "x")).toBe("We shoot weddings.");
  });
  it("cuts long text at a word boundary within the limit", () => {
    const out = metaDescription("word ".repeat(100), "x");
    expect(out.length).toBeLessThanOrEqual(155);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/wor…$/);
  });
});

const vendor: SeoVendor = {
  name: "Golden Hour",
  category: "photographer",
  bio: "Documentary wedding photography.",
  website: "https://golden.example",
  url: "https://knotly.test/wedding-vendors/charlotte-nc/photographer/golden-1",
  homeUrl: "https://knotly.test",
  city: { name: "Charlotte", state: "NC" },
  radiusMiles: 50,
  packages: [
    { name: "Essential", description: null, price: 1500 },
    { name: "Full day", description: "8 hours", price: 3500 },
  ],
  reviews: [
    { author: "Priya", rating: 5, body: "Wonderful", verified: true },
    { author: "Self", rating: 5, body: "Great (written by the vendor)", verified: false },
  ],
};

describe("vendorJsonLd", () => {
  const graph = vendorJsonLd(vendor)["@graph"] as Record<string, unknown>[];
  const business = graph[0] as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  it("describes a local business with its area, offers and price range", () => {
    expect(business["@type"]).toBe("LocalBusiness");
    expect(business.areaServed).toEqual({ "@type": "City", name: "Charlotte, NC" });
    expect(business.priceRange).toBe("$1500-$3500");
    expect(business.makesOffer).toHaveLength(2);
    expect(business.makesOffer[0]).toMatchObject({ price: 1500, priceCurrency: "USD" });
  });
  it("marks up only client-verified reviews", () => {
    expect(business.aggregateRating).toMatchObject({ ratingValue: 5, reviewCount: 1 });
    expect(business.review).toHaveLength(1);
    expect(business.review[0].author.name).toBe("Priya");
  });
  it("leaves out ratings when nothing is verified", () => {
    const none = vendorJsonLd({ ...vendor, reviews: [vendor.reviews[1]] })["@graph"][0] as Record<string, unknown>;
    expect(none.aggregateRating).toBeUndefined();
    expect(none.review).toBeUndefined();
  });
  it("adds breadcrumbs", () => {
    expect((graph[1] as Record<string, any>).itemListElement).toHaveLength(3); // eslint-disable-line @typescript-eslint/no-explicit-any
  });
  it("escapes < so text can't close the script tag", () => {
    expect(jsonLdString({ a: "</script><b>" })).not.toContain("</script>");
  });
});
