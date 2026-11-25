import { describe, it, expect, vi, beforeEach } from "vitest";

const auth = {
  getUser: vi.fn(),
  signInAnonymously: vi.fn(),
  updateUser: vi.fn(),
};
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: async () => ({ auth }) }));
import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://x/api/auth/signup", { method: "POST", body: JSON.stringify(body) }));
const email = { method: "email", identifier: "a@b.com" };

beforeEach(() => {
  vi.clearAllMocks();
  auth.updateUser.mockResolvedValue({ error: null });
});

describe("POST /api/auth/signup", () => {
  it("rejects a bad identifier", async () => {
    const res = await post({ method: "email", identifier: "nope" });
    expect(res.status).toBe(400);
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it("refuses someone who is already signed in", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "u1", is_anonymous: false } } });
    const res = await post(email);
    expect(res.status).toBe(400);
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("starts an anonymous session when there is none, then sends the code", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null } });
    auth.signInAnonymously.mockResolvedValue({ data: { user: { id: "g1", is_anonymous: true } }, error: null });
    const res = await post(email);
    expect(await res.json()).toEqual({ ok: true });
    expect(auth.signInAnonymously).toHaveBeenCalledOnce();
    expect(auth.updateUser).toHaveBeenCalledWith({ email: "a@b.com" });
  });

  it("reuses an existing guest session", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "g1", is_anonymous: true } } });
    await post(email);
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("fails cleanly when the anonymous session can't start", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null } });
    auth.signInAnonymously.mockResolvedValue({ data: { user: null }, error: { code: "x", message: "off" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post(email);
    expect(res.status).toBe(400);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("tells an existing account to sign in", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "g1", is_anonymous: true } } });
    auth.updateUser.mockResolvedValue({ error: { code: "email_exists", message: "dup" } });
    const res = await post(email);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, exists: true });
  });
});
