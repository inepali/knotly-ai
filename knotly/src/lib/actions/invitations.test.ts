import { describe, it, expect, vi } from "vitest";
import { saveDesign, sendInvitations } from "./invitations";
import { mockSb } from "./test-utils";

const H1 = "123e4567-e89b-42d3-a456-426614174001";
const H2 = "123e4567-e89b-42d3-a456-426614174002";
const project = { couple_projects: { data: { id: "p1", partner_names: "Priya & Sam", wedding_date: "2027-10-16", venue: "The Barn", metro_slug: null } } };
const db = (o: { active?: boolean; published?: boolean; sends?: unknown[] } = {}) =>
  mockSb(
    {
      ...project,
      invitation_designs: { data: [] },
      wedding_sites: { data: { slug: "ps", theme: "classic", title: null, photos: [], published_at: o.published === false ? null : "2027-01-01" } },
      guest_households: {
        data: [
          { id: H1, label: "The Patels", invite_token: "t1", rsvp_code: "A", guests: [{ email: "ravi@x.co" }, { email: "mira@x.co" }, { email: null }] },
          { id: H2, label: "Jordan Lee", invite_token: "t2", rsvp_code: "B", guests: [{ email: "jo@x.co" }] },
        ],
      },
      invitation_sends: [{ data: o.sends ?? [] }, { data: null }],
    },
    { data: o.active ?? true }
  );

describe("saveDesign", () => {
  it("needs the add-on", async () => {
    const r = await saveDesign(db({ active: false }).sb, "u1", { kind: "invitation", template: "classic", heading: "", message: "", details: "", show_photo: true });
    expect(r.ok).toBe(false);
  });
});

describe("sendInvitations", () => {
  const deps = () => ({ sendBatch: vi.fn().mockResolvedValue({ ids: ["e1", "e2", "e3"] }), siteUrl: "https://knotly.net" });

  it("needs a published website", async () => {
    expect((await sendInvitations(db({ published: false }).sb, "u1", { kind: "invitation", householdIds: [H1] }, deps())).ok).toBe(false);
  });

  it("emails every guest with an email, with the personal RSVP link, and logs each", async () => {
    const d = deps();
    const { sb, called } = db();
    const r = await sendInvitations(sb, "u1", { kind: "invitation", householdIds: [H1, H2] }, d);
    expect(r).toEqual({ ok: true, data: { households: 2, sent: 3, failed: 0 } });
    const batch = d.sendBatch.mock.calls[0][0] as { to: string; html: string }[];
    expect(batch.map((e) => e.to)).toEqual(["ravi@x.co", "mira@x.co", "jo@x.co"]);
    expect(batch[0].html).toContain("https://knotly.net/w/ps/rsvp?t=t1"); // has RSVP (mock rpc → true)
    const rows = called("invitation_sends", "insert")[0].args[0] as { household_id: string; status: string }[];
    expect(rows.map((x) => [x.household_id, x.status])).toEqual([[H1, "sent"], [H1, "sent"], [H2, "sent"]]);
  });

  it("stops at 2 sends per household", async () => {
    const sends = [
      { household_id: H1, kind: "invitation", status: "sent", sent_at: "2027-01-01T10:00:00Z" },
      { household_id: H1, kind: "invitation", status: "sent", sent_at: "2027-01-08T10:00:00Z" },
    ];
    const r = await sendInvitations(db({ sends }).sb, "u1", { kind: "invitation", householdIds: [H1] }, deps());
    expect(r.ok).toBe(false);
  });

  it("logs failures from the email provider", async () => {
    const d = { sendBatch: vi.fn().mockResolvedValue({ ids: [null], error: "bad address" }), siteUrl: "https://k" };
    const { sb, called } = db();
    const r = await sendInvitations(sb, "u1", { kind: "save_the_date", householdIds: [H2] }, d);
    expect(r).toEqual({ ok: true, data: { households: 1, sent: 0, failed: 1 } });
    expect((called("invitation_sends", "insert")[0].args[0] as { status: string }[])[0].status).toBe("failed");
  });
});
