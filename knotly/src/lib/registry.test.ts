import { describe, it, expect } from "vitest";
import { methodLink, parseUsd, remaining, storeFromUrl, usd } from "./registry";

describe("storeFromUrl", () => {
  it("names known stores and falls back to the domain", () => {
    expect(storeFromUrl("https://www.amazon.com/wedding/registry/abc")).toBe("Amazon");
    expect(storeFromUrl("https://www.crateandbarrel.com/gift-registry/x")).toBe("Crate & Barrel");
    expect(storeFromUrl("https://shop.example.org/list")).toBe("shop.example.org");
    expect(storeFromUrl("nope")).toBe("");
  });
});

describe("methodLink", () => {
  it("builds links from handles", () => {
    expect(methodLink({ kind: "venmo", value: "@Priya-Sam" })).toEqual({ href: "https://venmo.com/u/Priya-Sam", text: "@Priya-Sam" });
    expect(methodLink({ kind: "paypal", value: "https://paypal.me/priyasam/" })).toEqual({ href: "https://paypal.me/priyasam", text: "paypal.me/priyasam" });
    expect(methodLink({ kind: "cashapp", value: "$priya" })?.href).toBe("https://cash.app/$priya");
  });

  it("shows Zelle as text and refuses unsafe values", () => {
    expect(methodLink({ kind: "zelle", value: "priya@example.com" })).toEqual({ href: null, text: "priya@example.com" });
    expect(methodLink({ kind: "venmo", value: "bad handle!" })).toBeNull();
    expect(methodLink({ kind: "link", value: "javascript:alert(1)" })).toBeNull();
    expect(methodLink({ kind: "honeyfund", value: "http://insecure.com" })).toBeNull();
  });
});

describe("money", () => {
  it("parses and formats dollars", () => {
    expect(parseUsd("$1,250.50")).toBe(125050);
    expect(parseUsd("")).toBeNull();
    expect(parseUsd("abc")).toBeUndefined();
    expect(usd(125050)).toBe("$1,250.50");
    expect(usd(5000)).toBe("$50");
    expect(remaining({ quantity: 2, claimed: 3 })).toBe(0);
  });
});
