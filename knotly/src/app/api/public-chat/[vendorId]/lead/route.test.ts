import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  user: null as { id: string; is_anonymous?: boolean } | null,
  vendor: null as Record<string, unknown> | null,
  session: { id: "s1", vendorId: "v1", coupleUserId: null, threadId: null } as Record<string, unknown> | null,
  quota: {} as Record<string, boolean>,
  rpcs: [] as [string, Record<string, unknown>][],
  submit: { data: [{ lead_id: "l1", lead_status: "new", duplicate: false }], error: null } as { data: unknown; error: unknown },
  emails: [] as { to: string; subject: string }[],
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      h.rpcs.push([name, args]);
      return name === "submit_page_lead" ? h.submit : { data: "t1", error: null };
    },
  },
}));
vi.mock("@/lib/help-limit", () => ({
  takeHelpQuota: async (s: string) => h.quota[s.split(":")[0]] ?? true,
}));
vi.mock("@/lib/email", () => ({
  sendOneEmail: async (e: { to: string; subject: string }) => {
    h.emails.push(e);
    return {};
  },
}));
vi.mock("@/lib/site", () => ({ siteUrl: () => "https://knotly.test" }));
vi.mock("@/lib/public-chat-vendor", () => ({ loadChatVendor: async () => h.vendor }));
vi.mock("@/lib/public-chat-session", () => ({
  findChatSession: async () => h.session,
  hashIp: () => "iphash",
}));

import { POST } from "./route";

const UUID = "123e4567-e89b-42d3-a456-426614174000";
const good = { name: "Priya Shah", email: "priya@example.com", phone: "704-555-0134", weddingDate: "2027-06-14", need: "Photos for 120 guests in Charlotte" };
const send = (body: unknown) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ vendorId: UUID }) });
const submitArgs = () => h.rpcs.find(([n]) => n === "submit_page_lead")?.[1];

const VENDOR = { id: "v1", businessName: "Big Day Story", category: "photographer", agentName: "Maya", notes: null, email: "bds@example.com" };

beforeEach(() => {
  h.vendor = VENDOR;
  h.user = null;
  h.session = { id: "s1", vendorId: "v1", coupleUserId: null, threadId: null };
  h.quota = {};
  h.rpcs.length = 0;
  h.emails.length = 0;
  h.submit = { data: [{ lead_id: "l1", lead_status: "new", duplicate: false }], error: null };
});

describe("POST /api/public-chat/[vendorId]/lead", () => {
  it("saves the lead with a normalized phone and the consent text, and emails the vendor", async () => {
    const res = await send(good);
    expect(await res.json()).toEqual({ ok: true, duplicate: false, threadId: null });
    expect(submitArgs()).toMatchObject({
      p_session: "s1",
      p_phone: "+17045550134",
      p_flagged: false,
      p_couple: null,
      p_consent: expect.stringContaining("Big Day Story may contact you"),
    });
    expect(h.emails).toHaveLength(1);
    expect(h.emails[0].subject).toContain("Priya");
    expect(JSON.stringify(h.emails[0])).not.toContain("priya@example.com");
  });

  it("validates before saving", async () => {
    expect((await send({ ...good, email: "nope" })).status).toBe(400);
    expect((await send({ ...good, need: "hi" })).status).toBe(400);
    expect(submitArgs()).toBeUndefined();
  });

  it("swallows honeypot submissions without saving", async () => {
    const res = await send({ ...good, website: "http://spam" });
    expect(res.status).toBe(200);
    expect(submitArgs()).toBeUndefined();
  });

  it("needs a live chat session", async () => {
    h.session = null;
    expect((await send(good)).status).toBe(409);
  });

  it("limits repeat submits, and flags addresses sending to many vendors", async () => {
    h.quota = { lead: false };
    expect((await send(good)).status).toBe(429);
    h.quota = { "lead-ip": false };
    await send(good);
    expect(submitArgs()).toMatchObject({ p_flagged: true });
  });

  it("doesn't email again for a duplicate", async () => {
    h.submit = { data: [{ lead_id: "l1", lead_status: "new", duplicate: true }], error: null };
    await send(good);
    expect(h.emails).toHaveLength(0);
  });

  it("claims the chat straight into Messages for a signed-in couple", async () => {
    h.user = { id: "c1" };
    const res = await send(good);
    expect(await res.json()).toMatchObject({ threadId: "t1" });
    expect(submitArgs()).toMatchObject({ p_couple: "c1" });
    expect(h.rpcs.find(([n]) => n === "claim_vendor_chat")?.[1]).toEqual({ p_session: "s1", p_user: "c1" });
  });

  it("404s when the vendor's chat is off", async () => {
    h.vendor = null;
    expect((await send(good)).status).toBe(404);
  });
});
