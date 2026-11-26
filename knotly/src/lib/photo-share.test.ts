import { describe, it, expect } from "vitest";
import { isGuestPhotoPath, photosExpireAt, zipParts } from "./photo-share";
import { crc32, makeZip } from "./zip";

const P = "123e4567-e89b-42d3-a456-426614174000";

describe("photo share", () => {
  it("only accepts paths in this wedding's folder", () => {
    expect(isGuestPhotoPath(P, `${P}/223e4567-e89b-42d3-a456-426614174000.webp`)).toBe(true);
    expect(isGuestPhotoPath(P, `other/223e4567-e89b-42d3-a456-426614174000.webp`)).toBe(false);
    expect(isGuestPhotoPath(P, `${P}/../x.webp`)).toBe(false);
  });

  it("keeps photos a year after the wedding plus 30 days", () => {
    expect(photosExpireAt("2027-10-16", "2027-10-16T20:00:00Z").toISOString().slice(0, 10)).toBe("2028-11-14");
  });

  it("splits downloads into parts", () => {
    expect(zipParts([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe("zip", () => {
  it("computes CRC-32", () => {
    expect(crc32(new TextEncoder().encode("hello"))).toBe(0x3610a686);
  });

  it("writes local headers, central directory and end record", () => {
    const z = makeZip([{ name: "a.txt", data: new TextEncoder().encode("hello"), date: new Date(2027, 9, 16) }]);
    const v = new DataView(z.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    expect(v.getUint32(z.length - 22, true)).toBe(0x06054b50);
    expect(v.getUint16(z.length - 22 + 10, true)).toBe(1); // entries
    expect(z.length).toBe(30 + 5 + 5 + 46 + 5 + 22);
  });
});
