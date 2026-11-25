import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  admin: null as unknown,
  after: [] as (() => unknown)[],
  agent: vi.fn<(id: string) => Promise<void>>(async () => {}),
}));
vi.mock("@/lib/supabase/admin", () => ({
  get supabaseAdmin() {
    return h.admin;
  },
}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void h.after.push(fn) }));
vi.mock("@/agent/vendor/responder", () => ({ runVendorAgent: h.agent }));

import { advanceWaves, estimateProgress, postProject, projectPostBody, requestMoreEstimates } from "./posting";
import { mockSb } from "./test-utils";

const project = {
  id: "p1",
  wedding_date: "2027-06-05",
  metro_slug: "charlotte-nc",
  guest_count: 120,
  budget_total: 30000,
  style: "boho",
  posted_at: null as string | null,
};
const need = (category: string, extra = {}) => ({ category, budget: null, estimate_cap: 5, ...extra });
const thread = (id: string, status: string, rank: number, category = "photographer", quotes = 0) => ({
  id,
  status,
  queue_rank: rank,
  vendors: { category },
  quotes: Array.from({ length: quotes }, (_, i) => ({ id: `q${i}` })),
});

beforeEach(() => {
  vi.clearAllMocks();
  h.after.length = 0;
  h.admin = mockSb().sb;
});

describe("projectPostBody", () => {
  it("summarizes the wedding for the vendor in plain words", () => {
    const text = projectPostBody(project, { category: "photographer", budget: 3000, estimate_cap: 5 });
    expect(text).toContain("June 5, 2027");
    expect(text).toContain("near Charlotte, NC");
    expect(text).toContain("120 guests");
    expect(text).toContain("photographer");
    expect(text).toContain("$3,000 in mind for this");
  });
  it("falls back to the total budget", () => {
    expect(projectPostBody(project, need("dj"))).toContain("$30,000 in mind in total");
  });
});

describe("postProject", () => {
  it("needs saved wedding details", async () => {
    const { sb } = mockSb({ couple_projects: { data: null } });
    expect(await postProject(sb, "u1")).toEqual({ ok: false, error: "Save your wedding details first." });
  });

  it("says what is missing", async () => {
    const { sb } = mockSb({
      couple_projects: { data: { ...project, wedding_date: null, metro_slug: null } },
      project_needs: { data: [] },
    });
    const r = await postProject(sb, "u1");
    expect(!r.ok && r.error).toBe("Add your wedding date, your city, at least one vendor type you need before posting.");
  });

  it("on the first post: stamps posted_at, matches every need, queues in rank order, starts the waves", async () => {
    const { sb, called } = mockSb({
      couple_projects: { data: project },
      project_needs: { data: [need("photographer"), need("dj")] },
    });
    const admin = mockSb(
      { threads: [{ data: null }, { data: null }] },
      { data: [{ vendor_id: "v1" }, { vendor_id: "v2" }] }
    );
    h.admin = admin.sb;

    const r = await postProject(sb, "u1");
    expect(r).toEqual({ ok: true, data: { firstPost: true, matched: { photographer: 2, dj: 2 } } });
    expect(called("couple_projects", "update")[0].args[0]).toMatchObject({ posted_at: expect.any(String) });
    expect(admin.calls.filter((c) => c.method === "rpc").map((c) => (c.args[0] as { p_category: string }).p_category)).toEqual([
      "photographer",
      "dj",
    ]);
    const rows = admin.called("threads", "upsert")[0].args[0] as { status: string; origin: string; queue_rank: number }[];
    expect(rows.map((x) => [x.status, x.origin, x.queue_rank])).toEqual([
      ["queued", "post", 1],
      ["queued", "post", 2],
    ]);
    expect(h.after).toHaveLength(1);
  });

  it("after the first post: only matches categories that have no vendors queued yet", async () => {
    const { sb, called } = mockSb({
      couple_projects: { data: { ...project, posted_at: "2026-11-01T00:00:00Z" } },
      project_needs: { data: [need("photographer"), need("florist")] },
    });
    const admin = mockSb({ threads: { data: [{ vendors: { category: "photographer" } }] } }, { data: [] });
    h.admin = admin.sb;

    const r = await postProject(sb, "u1");
    expect(r).toEqual({ ok: true, data: { firstPost: false, matched: { florist: 0 } } });
    expect(called("couple_projects", "update")).toHaveLength(0);
    expect(admin.calls.filter((c) => c.method === "rpc")).toHaveLength(1);
  });

  it("returns a matching error", async () => {
    const { sb } = mockSb({ couple_projects: { data: project }, project_needs: { data: [need("dj")] } });
    h.admin = mockSb({}, { error: { message: "rpc down" } }).sb;
    expect(await postProject(sb, "u1")).toEqual({ ok: false, error: "rpc down" });
  });
});

describe("requestMoreEstimates", () => {
  it("rejects an unknown category", async () => {
    expect((await requestMoreEstimates(mockSb().sb, "u1", { category: "unicorns" })).ok).toBe(false);
  });

  it("only works for a category the couple needs", async () => {
    const { sb } = mockSb({ couple_projects: { data: project }, project_needs: { data: null } });
    expect(await requestMoreEstimates(sb, "u1", { category: "dj" })).toEqual({
      ok: false,
      error: "That isn't one of the vendor types you need.",
    });
  });

  it("raises the cap by 5, up to 50, and resumes the waves", async () => {
    const a = mockSb({ couple_projects: { data: project }, project_needs: { data: { estimate_cap: 5 } } });
    expect(await requestMoreEstimates(a.sb, "u1", { category: "dj" })).toEqual({ ok: true, data: { category: "dj", cap: 10 } });
    expect(h.after).toHaveLength(1);

    const b = mockSb({ couple_projects: { data: project }, project_needs: { data: { estimate_cap: 48 } } });
    const r = await requestMoreEstimates(b.sb, "u1", { category: "dj" });
    expect(r.ok && r.data.cap).toBe(50);
  });
});

describe("advanceWaves", () => {
  it("does nothing for a project that hasn't been posted", async () => {
    h.admin = mockSb({ couple_projects: { data: project } }).sb;
    expect(await advanceWaves("p1")).toEqual({ asked: 0 });
    expect(h.agent).not.toHaveBeenCalled();
  });

  it("asks only as many vendors as the cap leaves room for, then waits", async () => {
    const posted = { ...project, posted_at: "2026-11-01T00:00:00Z" };
    const admin = mockSb({
      couple_projects: { data: posted },
      project_needs: { data: [need("photographer", { estimate_cap: 2 })] },
      threads: [
        // round 1: three queued, nothing yet
        { data: [thread("t3", "queued", 3), thread("t1", "queued", 1), thread("t2", "queued", 2)] },
        { data: [{ id: "t1" }] }, // claim t1
        { data: [{ id: "t2" }] }, // claim t2
        // round 2: two in flight fill the cap
        { data: [thread("t1", "open", 1), thread("t2", "open", 2), thread("t3", "queued", 3)] },
      ],
      messages: { data: null },
    });
    h.admin = admin.sb;

    expect(await advanceWaves("p1")).toEqual({ asked: 2 });
    expect(h.agent.mock.calls.map((c) => c[0]).sort()).toEqual(["t1", "t2"]); // lowest ranks first
    const msgs = admin.called("messages", "insert").map((c) => c.args[0]) as { sender: string; payload: { type: string } }[];
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toMatchObject({ sender: "system", status: "sent", payload: { type: "project_post" } });
  });

  it("counts estimates already sent toward the cap", async () => {
    const admin = mockSb({
      couple_projects: { data: { ...project, posted_at: "x" } },
      project_needs: { data: [need("photographer", { estimate_cap: 2 })] },
      threads: { data: [thread("a", "quoted", 1, "photographer", 1), thread("b", "quoted", 2, "photographer", 1), thread("c", "queued", 3)] },
    });
    h.admin = admin.sb;
    expect(await advanceWaves("p1")).toEqual({ asked: 0 });
  });

  it("skips a vendor another worker already claimed", async () => {
    const admin = mockSb({
      couple_projects: { data: { ...project, posted_at: "x" } },
      project_needs: { data: [need("photographer", { estimate_cap: 1 })] },
      threads: [{ data: [thread("t1", "queued", 1)] }, { data: [] }],
    });
    h.admin = admin.sb;
    expect(await advanceWaves("p1")).toEqual({ asked: 0 });
    expect(h.agent).not.toHaveBeenCalled();
  });

  it("frees the slot when a vendor's agent throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.agent.mockRejectedValueOnce(new Error("model down"));
    const admin = mockSb({
      couple_projects: { data: { ...project, posted_at: "x" } },
      project_needs: { data: [need("photographer", { estimate_cap: 1 })] },
      threads: [
        { data: [thread("t1", "queued", 1)] },
        { data: [{ id: "t1" }] },
        { data: [thread("t1", "failed", 1)] }, // the "failed" update result, then round 2 state
      ],
    });
    h.admin = admin.sb;
    await advanceWaves("p1");
    const updates = admin.called("threads", "update").map((c) => c.args[0]);
    expect(updates).toContainEqual({ status: "failed" });
  });
});

describe("estimateProgress", () => {
  it("is empty before there's a wedding", async () => {
    const { sb } = mockSb({ couple_projects: { data: null } });
    expect(await estimateProgress(sb, "u1")).toEqual({ ok: true, data: { posted: false, categories: [] } });
  });

  it("reports per-category counts, including vendors still queued", async () => {
    const { sb } = mockSb({ couple_projects: { data: { ...project, posted_at: "x" } } });
    h.admin = mockSb({
      project_needs: { data: [need("photographer", { estimate_cap: 2 })] },
      threads: { data: [thread("a", "quoted", 1, "photographer", 1), thread("b", "open", 2), thread("c", "queued", 3), thread("d", "declined", 4)] },
    }).sb;
    const r = await estimateProgress(sb, "u1");
    expect(r.ok && r.data.categories).toEqual([{ category: "photographer", cap: 2, estimates: 1, waiting: 1, remaining: 1 }]);
  });
});
