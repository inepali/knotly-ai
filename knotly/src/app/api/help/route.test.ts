import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  user: null as { id: string; is_anonymous?: boolean } | null,
  vendor: null as { business_name: string } | null,
  role: "couple",
  quota: true,
  quotaCalls: [] as [string, number][],
  streamArgs: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const done = () =>
        Promise.resolve({
          data: table === "vendors" ? h.vendor : table === "profiles" ? { role: h.role } : null,
        });
      for (const m of ["select", "eq", "limit"]) chain[m] = () => chain;
      chain.maybeSingle = done;
      chain.single = done;
      return chain;
    },
  }),
}));
vi.mock("@/lib/help-limit", () => ({
  helpSubject: (id: string | null) => ({ subject: id ? `u:${id}` : "ip:x", limit: id ? 30 : 10 }),
  takeHelpQuota: async (s: string, l: number) => {
    h.quotaCalls.push([s, l]);
    return h.quota;
  },
}));
vi.mock("@/agent/models", () => ({ helpModel: "help-model" }));
vi.mock("@/lib/actions/knowledge", () => ({ askVendorKnowledge: vi.fn() }));
vi.mock("ai", async (orig) => ({
  ...(await orig<typeof import("ai")>()),
  streamText: (args: Record<string, unknown>) => {
    h.streamArgs = args;
    return { toUIMessageStreamResponse: () => new Response("streamed") };
  },
  convertToModelMessages: async (m: unknown) => m,
}));

import { POST } from "./route";

const UUID = "123e4567-e89b-42d3-a456-426614174000";
const ask = (body: unknown) => POST(new Request("http://x/api/help", { method: "POST", body: JSON.stringify(body) }));
const q = (text: string) => ({ id: "u", role: "user", parts: [{ type: "text", text }] });

beforeEach(() => {
  h.user = { id: "u1" };
  h.vendor = { business_name: "Golden Hour" };
  h.role = "couple";
  h.quota = true;
  h.quotaCalls.length = 0;
  h.streamArgs = null;
});

describe("POST /api/help", () => {
  it("rejects a missing or too-long question before spending anything", async () => {
    expect((await ask({})).status).toBe(400);
    expect((await ask({ messages: [] })).status).toBe(400);
    expect((await ask({ messages: [q("x".repeat(1001))] })).status).toBe(400);
    expect(h.quotaCalls).toHaveLength(0);
    expect(h.streamArgs).toBeNull();
  });

  it("platform help needs an account", async () => {
    h.user = null;
    expect((await ask({ messages: [q("hi")] })).status).toBe(401);
    h.user = { id: "g1", is_anonymous: true };
    expect((await ask({ messages: [q("hi")] })).status).toBe(401);
  });

  it("stops at the daily cap", async () => {
    h.quota = false;
    const res = await ask({ messages: [q("hi")] });
    expect(res.status).toBe(429);
    expect(h.streamArgs).toBeNull();
  });

  it("answers platform help with the cheap model, a cached system prompt, no tools and 2 steps", async () => {
    const res = await ask({ messages: [q("How do I post?")] });
    expect(await res.text()).toBe("streamed");
    expect(h.quotaCalls).toEqual([["u:u1", 30]]);
    const a = h.streamArgs!;
    expect(a.model).toBe("help-model");
    expect(a.tools).toEqual({});
    expect(a.maxOutputTokens).toBe(600);
    expect(a.system).toMatchObject({ role: "system", providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } });
    expect(JSON.stringify(a.system)).toContain("My Wedding");
    expect(a.stopWhen).toBeTypeOf("function");
  });

  it("uses the vendor's own help doc for vendors", async () => {
    h.role = "vendor";
    await ask({ messages: [q("hi")] });
    expect(JSON.stringify(h.streamArgs!.system)).toContain("Agent Settings");
  });

  it("vendor help works logged out, on the lower cap, with only a read-only knowledge search", async () => {
    h.user = null;
    const res = await ask({ messages: [q("Do you travel?")], vendorId: UUID });
    expect(res.status).toBe(200);
    expect(h.quotaCalls).toEqual([["ip:x", 10]]);
    expect(Object.keys(h.streamArgs!.tools as object)).toEqual(["searchKnowledge"]);
    expect(JSON.stringify(h.streamArgs!.system)).toContain("Golden Hour");
  });

  it("404s a vendor the person can't see, and rejects a bad vendor id", async () => {
    h.vendor = null;
    expect((await ask({ messages: [q("hi")], vendorId: UUID })).status).toBe(404);
    expect((await ask({ messages: [q("hi")], vendorId: "nope" })).status).toBe(400);
  });
});
