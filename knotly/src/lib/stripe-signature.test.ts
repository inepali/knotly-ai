import { describe, it, expect } from "vitest";
import { signPayload, verifyStripeSignature } from "./stripe-signature";

const SECRET = "whsec_test";
const BODY = '{"id":"evt_1"}';
const NOW = 1_800_000_000;
const header = (t: number, body = BODY, secret = SECRET) => `t=${t},v1=${signPayload(body, secret, t)}`;

describe("verifyStripeSignature", () => {
  it("accepts a correct, recent signature", () => {
    expect(verifyStripeSignature(BODY, header(NOW), SECRET, NOW)).toBe(true);
    expect(verifyStripeSignature(BODY, `${header(NOW)},v1=deadbeef`, SECRET, NOW)).toBe(true);
  });

  it("rejects a changed body, wrong secret, old timestamp or junk", () => {
    expect(verifyStripeSignature('{"id":"evt_2"}', header(NOW), SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(BODY, header(NOW, BODY, "other"), SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(BODY, header(NOW - 301), SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(BODY, "nonsense", SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(BODY, null, SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(BODY, header(NOW), "", NOW)).toBe(false);
  });
});
