import { describe, expect, it } from "vitest";
import { CATEGORY_SLUGS } from "./categories";
import {
  cityPath,
  countByCategory,
  dailySeed,
  isIndexable,
  listingCopy,
  listingFaq,
  listingJsonLd,
  listingNoun,
  listingPath,
  lowerNoun,
  nearbyCities,
  priceStats,
  seededShuffle,
  weddingPrefillPath,
} from "./listing";

const charlotte = { slug: "charlotte-nc", name: "Charlotte", state: "NC", lat: 35.2271, lng: -80.8431 };
const raleigh = { slug: "raleigh-nc", name: "Raleigh", state: "NC", lat: 35.7796, lng: -78.6382 };
const greenville = { slug: "greenville-sc", name: "Greenville", state: "SC", lat: 34.8526, lng: -82.394 };

describe("addresses", () => {
  it("builds city and listing paths under /wedding-vendors", () => {
    expect(cityPath("charlotte-nc")).toBe("/wedding-vendors/charlotte-nc");
    expect(listingPath("charlotte-nc", "hair_stylist")).toBe("/wedding-vendors/charlotte-nc/hair-stylist");
  });
});

describe("listingNoun", () => {
  it("has a search-style name for every category", () => {
    for (const c of CATEGORY_SLUGS) expect(listingNoun(c)).not.toMatch(/_/);
  });
  it("reads like a search", () => {
    expect(listingNoun("photographer")).toBe("Wedding Photographers");
    expect(listingNoun("wedding_planner")).toBe("Wedding Planners"); // not "Wedding Wedding Planners"
  });
  it("keeps acronyms when lower-cased", () => {
    expect(lowerNoun("Wedding DJs")).toBe("wedding DJs");
  });
});

describe("isIndexable", () => {
  it("needs at least 3 vendors", () => {
    expect([0, 1, 2, 3, 10].map(isIndexable)).toEqual([false, false, false, true, true]);
  });
});

describe("dailySeed", () => {
  it("uses the Charlotte date, not UTC", () => {
    // 2026-11-27 02:00 UTC is still the 26th in New York.
    expect(dailySeed(new Date("2026-11-27T02:00:00Z"))).toBe("2026-11-26");
  });
});

describe("seededShuffle", () => {
  const ids = Array.from({ length: 20 }, (_, i) => `v${i}`);
  const key = (s: string) => s;

  it("is the same all day", () => {
    expect(seededShuffle(ids, "2026-11-26", key)).toEqual(seededShuffle([...ids].reverse(), "2026-11-26", key));
  });
  it("changes from day to day and keeps everyone", () => {
    const a = seededShuffle(ids, "2026-11-26", key);
    const b = seededShuffle(ids, "2026-11-27", key);
    expect(a).not.toEqual(b);
    expect([...b].sort()).toEqual([...ids].sort());
  });
  it("doesn't reshuffle everyone when a vendor joins", () => {
    const before = seededShuffle(ids, "d", key);
    const after = seededShuffle([...ids, "new"], "d", key).filter((x) => x !== "new");
    expect(after).toEqual(before);
  });
});

describe("priceStats", () => {
  it("needs enough prices to be fair", () => {
    expect(priceStats([1000, 2000])).toBeNull();
    expect(priceStats([1000, null, 0, 2000])).toBeNull();
  });
  it("returns low, median and high", () => {
    expect(priceStats([3000, 1000, 2000])).toEqual({ low: 1000, median: 2000, high: 3000, count: 3 });
    expect(priceStats([1000, 2000, 3000, 4000])).toMatchObject({ median: 2500 });
  });
});

describe("listingCopy", () => {
  const stats = { low: 1200, median: 2400, high: 5000, count: 4 };
  it("puts the count and year in the title once the page is indexable", () => {
    const c = listingCopy({ category: "photographer", city: charlotte, count: 4, stats, year: 2026 });
    expect(c.h1).toBe("Wedding Photographers in Charlotte, NC");
    expect(c.title).toBe("4 Wedding Photographers in Charlotte, NC (2026) | Knotly");
    expect(c.intro).toContain("$1,200 to $5,000");
    expect(c.description.length).toBeLessThanOrEqual(160);
  });
  it("leaves the count out of thin pages", () => {
    const c = listingCopy({ category: "dj", city: charlotte, count: 2, stats: null, year: 2026 });
    expect(c.title).toBe("Wedding DJs in Charlotte, NC | Knotly");
    expect(c.intro).toContain("2 wedding DJs");
  });
  it("has copy for an empty page", () => {
    expect(listingCopy({ category: "dj", city: charlotte, count: 0, stats: null, year: 2026 }).intro).toMatch(/still adding/);
  });
});

describe("listingFaq", () => {
  it("adds the price question only with real numbers", () => {
    expect(listingFaq({ category: "dj", city: charlotte, stats: null })).toHaveLength(2);
    const faq = listingFaq({ category: "dj", city: charlotte, stats: { low: 500, median: 900, high: 2000, count: 5 } });
    expect(faq[0].q).toBe("How much do wedding DJs cost in Charlotte?");
    expect(faq[0].a).toContain("$900");
  });
});

describe("nearbyCities", () => {
  it("orders other cities by distance", () => {
    expect(nearbyCities(charlotte, [raleigh, charlotte, greenville]).map((c) => c.slug)).toEqual(["greenville-sc", "raleigh-nc"]);
  });
});

describe("countByCategory", () => {
  it("counts in display order and skips empty categories", () => {
    const rows = [{ category: "dj" }, { category: "photographer" }, { category: "dj" }];
    expect(countByCategory(rows, ["venue", "photographer", "dj"])).toEqual([
      { category: "photographer", count: 1 },
      { category: "dj", count: 2 },
    ]);
  });
});

describe("listingJsonLd", () => {
  it("has breadcrumbs and a numbered item list", () => {
    const ld = listingJsonLd({
      crumbs: [
        { name: "Home", url: "https://k.test" },
        { name: "Charlotte, NC", url: "https://k.test/wedding-vendors/charlotte-nc" },
      ],
      name: "Wedding DJs in Charlotte, NC",
      url: "https://k.test/wedding-vendors/charlotte-nc/dj",
      items: [{ name: "A", url: "https://k.test/a" }],
    });
    const [crumbs, list] = ld["@graph"] as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(crumbs.itemListElement[1]).toMatchObject({ position: 2, name: "Charlotte, NC" });
    expect(list).toMatchObject({ "@type": "ItemList", numberOfItems: 1 });
    expect(list.itemListElement[0]).toMatchObject({ position: 1, url: "https://k.test/a" });
  });
});

describe("weddingPrefillPath", () => {
  it("carries the city and vendor type to My Wedding", () => {
    expect(weddingPrefillPath("charlotte-nc", "hair-stylist")).toBe("/client/dashboard/my-wedding?metro=charlotte-nc&need=hair_stylist");
  });
  it("drops anything that isn't a plain slug", () => {
    expect(weddingPrefillPath("https://evil.example", "dj")).toBe("/client/dashboard/my-wedding?need=dj");
    expect(weddingPrefillPath(undefined, "../x")).toBeNull();
  });
});
