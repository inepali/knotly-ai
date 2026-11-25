import { describe, it, expect, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { rpc } }));
import { helpSubject, takeHelpQuota } from "./help-limit";

describe("helpSubject", () => {
  it("counts signed-in people by account on the full daily cap", () => {
    expect(helpSubject("u1", "1.2.3.4")).toEqual({ subject: "u:u1", limit: 30 });
  });

  it("counts visitors by a hash of their address on the lower cap, never the raw address", () => {
    const a = helpSubject(null, "1.2.3.4, 10.0.0.1");
    expect(a.limit).toBe(10);
    expect(a.subject).toMatch(/^ip:[0-9a-f]{32}$/);
    expect(a.subject).not.toContain("1.2.3.4");
    expect(helpSubject(null, "1.2.3.4").subject).toBe(a.subject); // first address in the list
    expect(helpSubject(null, "5.6.7.8").subject).not.toBe(a.subject);
    expect(helpSubject(null, null).subject).toMatch(/^ip:/);
  });
});

describe("takeHelpQuota", () => {
  it("is true only when the database counted the message", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null });
    expect(await takeHelpQuota("u:1", 30)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("take_help_quota", { p_subject: "u:1", p_limit: 30 });
    rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await takeHelpQuota("u:1", 30)).toBe(false);
  });

  it("fails closed when the counter is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValueOnce({ data: null, error: { message: "down" } });
    expect(await takeHelpQuota("u:1", 30)).toBe(false);
  });
});
