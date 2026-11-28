import { describe, it, expect, vi } from "vitest";
import { grantSignupCredit, signupCreditNotice } from "./signup-credit";
import { mockSb } from "./actions/test-utils";

describe("grantSignupCredit", () => {
  it("returns the cents granted", async () => {
    const { sb, called } = mockSb({}, { data: 1000 });
    expect(await grantSignupCredit(sb, "v1")).toBe(1000);
    expect(called("rpc:grant_signup_credit", "rpc")[0].args[0]).toEqual({ p_vendor: "v1" });
  });

  it("returns 0 when not eligible or already claimed", async () => {
    const { sb } = mockSb({}, { data: 0 });
    expect(await grantSignupCredit(sb, "v1")).toBe(0);
  });

  it("returns 0 quietly when the business row doesn't exist yet", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sb } = mockSb({}, { error: { message: "vendor not found" } });
    expect(await grantSignupCredit(sb, "v1")).toBe(0);
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("logs other errors but never throws", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sb } = mockSb({}, { error: { message: "boom" } });
    expect(await grantSignupCredit(sb, "v1")).toBe(0);
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});

describe("signupCreditNotice", () => {
  it("says the credit and about how many leads", () => {
    expect(signupCreditNotice(1000)).toBe("You have $10 in free credit, about 10 leads.");
    expect(signupCreditNotice(150)).toBe("You have $1.50 in free credit, about 1 lead.");
    expect(signupCreditNotice(1000, 150)).toBe("You have $10 in free credit, about 6 leads.");
    expect(signupCreditNotice(50)).toBe("You have $0.50 in free credit.");
  });
});
