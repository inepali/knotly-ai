import { describe, it, expect } from "vitest";
import { homeFor, SignupRole } from "./auth";

describe("homeFor", () => {
  it("sends vendors to /vendor and everyone else to /chat", () => {
    expect(homeFor("vendor")).toBe("/vendor");
    for (const r of ["couple", "admin", null, undefined, "weird"]) expect(homeFor(r)).toBe("/chat");
  });
});

describe("SignupRole", () => {
  it("never lets someone self-assign admin", () => {
    expect(SignupRole.safeParse("admin").success).toBe(false);
    expect(SignupRole.safeParse("vendor").success).toBe(true);
  });
});
