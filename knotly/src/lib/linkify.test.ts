import { describe, it, expect } from "vitest";
import { isInternalPath, linkify } from "./linkify";

describe("linkify", () => {
  it("turns an internal markdown link into a link segment", () => {
    expect(linkify("Open [Go to My Wedding →](/client/dashboard/my-wedding) to start.")).toEqual([
      { type: "text", text: "Open " },
      { type: "link", text: "Go to My Wedding →", href: "/client/dashboard/my-wedding" },
      { type: "text", text: " to start." },
    ]);
  });

  it("leaves text without links alone", () => {
    expect(linkify("Just text")).toEqual([{ type: "text", text: "Just text" }]);
    expect(linkify("")).toEqual([]);
  });

  it("never links off-site or script addresses", () => {
    for (const href of ["https://evil.com", "//evil.com", "javascript:alert(1)", "/\\evil.com", "mailto:a@b.com", "evil.com"]) {
      const out = linkify(`[click](${href})`);
      expect(out.every((s) => s.type === "text")).toBe(true);
    }
  });

  it("handles several links, and keeps a bad one as plain text", () => {
    const out = linkify("[A](/inbox) and [B](https://x.com) and [C](/vendors/abc?x=1)");
    expect(out.filter((s) => s.type === "link").map((s) => (s as { href: string }).href)).toEqual(["/inbox", "/vendors/abc?x=1"]);
    expect(out.map((s) => s.text).join("")).toContain("[B](https://x.com)");
  });
});

describe("isInternalPath", () => {
  it("accepts same-site paths only", () => {
    expect(isInternalPath("/inbox")).toBe(true);
    expect(isInternalPath("/inbox/123e4567-e89b-42d3-a456-426614174000")).toBe(true);
    expect(isInternalPath("inbox")).toBe(false);
    expect(isInternalPath("//x")).toBe(false);
    expect(isInternalPath("/a b")).toBe(false);
  });
});
