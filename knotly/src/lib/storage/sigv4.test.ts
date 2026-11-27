import { describe, it, expect } from "vitest";
import { awsEncode, presignUrl } from "./sigv4";

// The worked example from AWS's "Authenticating Requests: Using Query Parameters" docs:
// GET https://examplebucket.s3.amazonaws.com/test.txt, us-east-1, 86400 s, 2013-05-24T00:00:00Z.
describe("presignUrl", () => {
  it("matches AWS's published example signature", () => {
    const url = presignUrl({
      method: "GET",
      host: "examplebucket.s3.amazonaws.com",
      path: "/test.txt",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      region: "us-east-1",
      expiresIn: 86400,
      now: new Date("2013-05-24T00:00:00Z"),
    });
    expect(url).toBe(
      "https://examplebucket.s3.amazonaws.com/test.txt" +
        "?X-Amz-Algorithm=AWS4-HMAC-SHA256" +
        "&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request" +
        "&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host" +
        "&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404"
    );
  });

  it("signs extra headers and encodes key segments", () => {
    const url = new URL(
      presignUrl({
        method: "PUT",
        host: "acct.r2.cloudflarestorage.com",
        path: "/knotly-files/portfolio/v 1/a+b.webp",
        accessKeyId: "k",
        secretAccessKey: "s",
        expiresIn: 300,
        headers: { "Content-Type": "image/webp", "Content-Length": "1234" },
        now: new Date("2026-11-27T12:00:00Z"),
      })
    );
    expect(url.pathname).toBe("/knotly-files/portfolio/v%201/a%2Bb.webp");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host");
    expect(url.searchParams.get("X-Amz-Credential")).toBe("k/20261127/auto/s3/aws4_request");
  });

  it("refuses silly expiry and encodes like AWS", () => {
    expect(() => presignUrl({ method: "GET", host: "h", path: "/b/k", accessKeyId: "a", secretAccessKey: "b", expiresIn: 0 })).toThrow();
    expect(awsEncode("a b!'()*~")).toBe("a%20b%21%27%28%29%2A~");
  });
});
