import { describe, it, expect } from "vitest";
import { qrMatrix, qrSvg } from "./qr";

// The encoder was checked against a real decoder (OpenCV) for versions 1, 3, 5, 7 and 10, including
// unicode text. These tests pin the structure so regressions show up without one.
describe("qrMatrix", () => {
  it("picks the smallest version that fits", () => {
    expect(qrMatrix("hi")).toHaveLength(21); // v1
    expect(qrMatrix("https://knotly.net/w/priya-and-sam")).toHaveLength(29); // v3
    expect(qrMatrix("x".repeat(213))).toHaveLength(57); // v10
    expect(() => qrMatrix("x".repeat(214))).toThrow();
  });

  it("draws the three finder patterns and timing lines", () => {
    const m = qrMatrix("https://knotly.net");
    const n = m.length;
    const finderOk = (r: number, c: number) => m[r][c] && m[r + 6][c + 6] && !m[r + 1][c + 1] && m[r + 3][c + 3];
    expect(finderOk(0, 0) && finderOk(0, n - 7) && finderOk(n - 7, 0)).toBe(true);
    for (let i = 8; i < n - 8; i++) {
      expect(m[6][i]).toBe(i % 2 === 0);
      expect(m[i][6]).toBe(i % 2 === 0);
    }
    expect(m[n - 8][8]).toBe(true); // dark module
  });

  it("is deterministic", () => {
    expect(JSON.stringify(qrMatrix("same"))).toBe(JSON.stringify(qrMatrix("same")));
  });
});

describe("qrSvg", () => {
  it("renders an SVG with a quiet zone", () => {
    const svg = qrSvg("hi", { size: 100 });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('viewBox="0 0 29 29"');
  });
});
