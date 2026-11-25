import { describe, it, expect } from "vitest";
import { homeFor, SignupRole } from "./auth";

describe("homeFor", () => {
  it("sends couples to their dashboard, vendors to /vendor and everyone else to /chat", () => {
    expect(homeFor("couple")).toBe("/client/dashboard/my-wedding");
    expect(homeFor("vendor")).toBe("/vendor");
    for (const r of ["admin", null, undefined, "weird"]) expect(homeFor(r)).toBe("/chat");
  });
});

describe("SignupRole", () => {
  it("never lets someone self-assign admin", () => {
    expect(SignupRole.safeParse("admin").success).toBe(false);
    expect(SignupRole.safeParse("vendor").success).toBe(true);
  });
});
