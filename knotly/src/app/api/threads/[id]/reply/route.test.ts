import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  user: { id: "couple1", is_anonymous: false } as { id: string; is_anonymous: boolean } | null,
  messagingOpen: false as boolean | null,
  inserts: [] as unknown[],
}));
const thread = { id: "t1", vendor_id: "vendor1", vendors: { business_name: "Golden Hour" }, couple_projects: { couple_id: "couple1", partner_names: "Priya & Sam" } };

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: thread }) }) }) }),
    rpc: async (name: string) => ({ data: name === "thread_messaging_open" ? h.messagingOpen : null, error: null }),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: () => ({
      insert: (row: unknown) => {
        h.inserts.push(row);
        return { select: () => ({ single: async () => ({ data: { id: "m1" }, error: null }) }) };
      },
    }),
  },
}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendMessageEmail: vi.fn() }));
vi.mock("@/agent/vendor/responder", () => ({ runVendorAgent: vi.fn() }));
import { POST } from "./route";

const T1 = "123e4567-e89b-42d3-a456-426614174000";
const post = (body: unknown) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }) as never, {
    params: Promise.resolve({ id: T1 }),
  } as never);

beforeEach(() => {
  h.user = { id: "couple1", is_anonymous: false };
  h.messagingOpen = false;
  h.inserts.length = 0;
});

describe("POST /api/threads/[id]/reply — locked until an estimate is opened", () => {
  it("refuses the couple on a posted project they haven't opened an estimate in", async () => {
    const res = await post({ body: "Hi! Are you free?" });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/Open the estimate/);
    expect(h.inserts).toHaveLength(0);
  });

  it("refuses the vendor too, with their own wording", async () => {
    h.user = { id: "vendor1", is_anonymous: false };
    const res = await post({ body: "Following up!" });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/once they open your estimate/);
    expect(h.inserts).toHaveLength(0);
  });

  it("treats an unknown answer as locked", async () => {
    h.messagingOpen = null;
    expect((await post({ body: "Hi" })).status).toBe(403);
  });
});
