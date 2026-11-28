import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  auth: { verifyOtp: vi.fn(), updateUser: vi.fn() },
  updates: [] as unknown[],
  role: "couple" as string,
  grant: vi.fn<(admin: unknown, vendorId: string) => Promise<number>>(async () => 1000),
  claim: vi.fn<(userId: string) => Promise<number>>(async () => 0),
}));
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: async () => ({ auth: h.auth }) }));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { role: h.role } }) }) }),
      update: (patch: unknown) => {
        h.updates.push(patch);
        return { eq: async () => ({ error: null }) };
      },
    }),
  },
}));
vi.mock("@/lib/signup-credit", () => ({ grantSignupCredit: h.grant }));
vi.mock("@/lib/public-chat-session", () => ({ claimChatsFromCookies: h.claim }));
import { POST } from "./route";

const post = (body: Record<string, unknown>) =>
  POST(
    new Request("http://x/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ code: "12345678", password: "longenough", acceptedTerms: true, ...body }),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.updates.length = 0;
  h.role = "couple";
  h.auth.verifyOtp.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  h.auth.updateUser.mockResolvedValue({ error: null });
});

describe("POST /api/auth/verify", () => {
  it("refuses a wrong code and grants nothing", async () => {
    h.auth.verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: "bad" } });
    const res = await post({ method: "email", identifier: "a@b.com", role: "vendor" });
    expect(res.status).toBe(400);
    expect(h.grant).not.toHaveBeenCalled();
  });

  it("tries the signup credit for a vendor after the email code", async () => {
    const res = await post({ method: "email", identifier: "Shop@B.com", role: "vendor" });
    expect(await res.json()).toEqual({ ok: true, role: "vendor", claimedChats: 0 });
    expect(h.grant).toHaveBeenCalledWith(expect.anything(), "u1");
    expect(h.updates[0]).toMatchObject({ role: "vendor", email: "shop@b.com" });
  });

  it("doesn't try the credit for a couple", async () => {
    await post({ method: "email", identifier: "a@b.com", role: "couple" });
    expect(h.grant).not.toHaveBeenCalled();
  });

  it("moves a couple's public-page chats into Messages, never a vendor's", async () => {
    h.claim.mockResolvedValueOnce(1);
    const res = await post({ method: "email", identifier: "a@b.com", role: "couple" });
    expect(await res.json()).toEqual({ ok: true, role: "couple", claimedChats: 1 });
    expect(h.claim).toHaveBeenCalledWith("u1");
    await post({ method: "email", identifier: "a@b.com", role: "vendor" });
    expect(h.claim).toHaveBeenCalledOnce();
  });

  it("marks the phone verified after a phone code", async () => {
    await post({ method: "phone", identifier: "+17045551234", role: "vendor" });
    expect(h.updates[0]).toMatchObject({ phone: "+17045551234", phone_verified: true });
    expect(h.grant).toHaveBeenCalledOnce();
  });

  it("never downgrades an admin, and doesn't grant them a vendor credit", async () => {
    h.role = "admin";
    const res = await post({ method: "email", identifier: "a@b.com", role: "vendor" });
    expect(await res.json()).toEqual({ ok: true, role: "admin", claimedChats: 0 });
    expect(h.updates[0]).not.toHaveProperty("role");
    expect(h.grant).not.toHaveBeenCalled();
  });
});
