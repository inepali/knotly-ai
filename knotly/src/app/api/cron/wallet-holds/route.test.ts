import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({ rpc: vi.fn(async (_name: string) => ({ data: 3 as unknown, error: null as { message: string } | null })) }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { rpc: h.rpc } }));
import { GET } from "./route";

const call = (auth?: string) => GET(new Request("http://x/api/cron/wallet-holds", { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "s3cret");
  h.rpc.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/cron/wallet-holds", () => {
  it("releases stale holds", async () => {
    const res = await call("Bearer s3cret");
    expect(await res.json()).toEqual({ released: 3 });
    expect(h.rpc).toHaveBeenCalledWith("release_stale_holds");
  });

  it("refuses a wrong or missing secret", async () => {
    expect((await call("Bearer nope")).status).toBe(401);
    expect((await call()).status).toBe(401);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("refuses everything when CRON_SECRET isn't set (no 'Bearer undefined')", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer undefined")).status).toBe(401);
    expect((await call("Bearer ")).status).toBe(401);
  });

  it("reports a database error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect((await call("Bearer s3cret")).status).toBe(500);
  });
});
