import { describe, it, expect } from "vitest";
import { checkSitePassword, hashSitePassword, isUnlocked, unlockToken } from "./site-password";

describe("site password", () => {
  it("hashes with a salt and checks", () => {
    const h = hashSitePassword("sunflower");
    expect(h).toMatch(/^scrypt\$/);
    expect(hashSitePassword("sunflower")).not.toBe(h);
    expect(checkSitePassword("sunflower", h)).toBe(true);
    expect(checkSitePassword("Sunflower", h)).toBe(false);
    expect(checkSitePassword("x", null)).toBe(false);
  });

  it("unlock cookie is tied to the slug and the current password", () => {
    const h = hashSitePassword("a1b2");
    expect(isUnlocked("ps", h, unlockToken("ps", h))).toBe(true);
    expect(isUnlocked("other", h, unlockToken("ps", h))).toBe(false);
    expect(isUnlocked("ps", hashSitePassword("new!"), unlockToken("ps", h))).toBe(false);
    expect(isUnlocked("ps", h, undefined)).toBe(false);
    expect(isUnlocked("ps", null, undefined)).toBe(true);
  });
});
