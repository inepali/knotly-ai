import { describe, it, expect } from "vitest";
import { formatWeddingDate, isOwnSitePath, normalizeSections, safeUrl, slugError, suggestSlug, visibleSections, defaultSections } from "./wedding-site";

describe("slugs", () => {
  it("suggests from partner names", () => {
    expect(suggestSlug("Priya & Sam")).toBe("priya-and-sam");
    expect(suggestSlug("José + Zoë", 2027)).toBe("jose-and-zoe-2027");
    expect(suggestSlug(null)).toBe("our-wedding");
  });

  it("validates format and reserved words", () => {
    expect(slugError("priya-and-sam")).toBeNull();
    expect(slugError("ab")).not.toBeNull();
    expect(slugError("-abc")).not.toBeNull();
    expect(slugError("a--b")).not.toBeNull();
    expect(slugError("Priya")).not.toBeNull();
    expect(slugError("admin")).toMatch(/reserved/);
  });
});

describe("sections", () => {
  it("keeps saved order, drops unknown/duplicate types and adds missing ones", () => {
    const s = normalizeSections([{ type: "faq", enabled: true, items: [] }, { type: "nope" }, { type: "faq", enabled: false }]);
    expect(s[0]).toMatchObject({ type: "faq", enabled: true });
    expect(s.map((x) => x.type).filter((t) => t === "faq")).toHaveLength(1);
    expect(s).toHaveLength(defaultSections().length);
  });

  it("starts the story from My Wedding", () => {
    expect(normalizeSections(null, "We met at a concert").find((x) => x.type === "story")).toMatchObject({ enabled: true, text: "We met at a concert" });
  });

  it("hides empty, disabled and locked sections", () => {
    const all = defaultSections("story").map((s) => ({ ...s, enabled: true }));
    const shown = visibleSections(all, { owned: ["rsvp"], hasEvents: false, hasPhotos: false }).map((s) => s.type);
    expect(shown).toEqual(["hero", "story", "rsvp"]);
  });
});

describe("helpers", () => {
  it("only allows http(s) links", () => {
    expect(safeUrl("https://hotel.com/x")).toBe("https://hotel.com/x");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("not a url")).toBeNull();
  });

  it("checks photo paths stay in the wedding's folder", () => {
    const p = "123e4567-e89b-42d3-a456-426614174000";
    expect(isOwnSitePath(p, `${p}/223e4567-e89b-42d3-a456-426614174000.webp`)).toBe(true);
    expect(isOwnSitePath(p, `other/223e4567-e89b-42d3-a456-426614174000.webp`)).toBe(false);
    expect(isOwnSitePath(p, `${p}/../x.webp`)).toBe(false);
  });

  it("formats the date without shifting the day", () => {
    expect(formatWeddingDate("2027-10-16")).toBe("Saturday, October 16, 2027");
  });
});
