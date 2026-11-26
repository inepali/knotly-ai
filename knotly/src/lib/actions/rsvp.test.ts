import { describe, it, expect, vi } from "vitest";
import { saveRsvpSettings, sendRsvpReminders } from "./rsvp";
import { mockSb } from "./test-utils";

const project = { couple_projects: { data: { id: "p1", partner_names: "Priya & Sam" } } };
const settings = { deadline: "2027-09-01", meal_options: ["Fish", "Fish"], questions: [], require_code: false, ask_dietary: true, ask_song: false };

describe("saveRsvpSettings", () => {
  it("needs the add-on", async () => {
    const { sb } = mockSb(project, { data: false });
    expect(await saveRsvpSettings(sb, "u1", settings)).toEqual({ ok: false, error: "Unlock the RSVP add-on first." });
  });

  it("de-dupes meals and saves", async () => {
    const { sb, called } = mockSb({ ...project, rsvp_settings: {} }, { data: true });
    expect((await saveRsvpSettings(sb, "u1", settings)).ok).toBe(true);
    expect(called("rsvp_settings", "upsert")[0].args[0]).toMatchObject({ project_id: "p1", meal_options: ["Fish"], deadline: "2027-09-01" });
  });

  it("caps extra questions at 3", async () => {
    const qs = Array.from({ length: 4 }, (_, i) => ({ id: `q${i}`, label: "Q" }));
    expect((await saveRsvpSettings(mockSb(project, { data: true }).sb, "u1", { ...settings, questions: qs })).ok).toBe(false);
  });
});

describe("sendRsvpReminders", () => {
  const households = [
    { id: "h1", label: "A", plus_ones: 0, invite_token: "t1", rsvp_code: "X", guests: [{ id: "g1", first_name: "A", last_name: "", is_child: false, sort: 0 }], guest_event_invites: [] },
    { id: "h2", label: "B", plus_ones: 0, invite_token: "t2", rsvp_code: "Y", guests: [{ id: "g2", first_name: "B", last_name: "", is_child: false, sort: 0 }], guest_event_invites: [] },
    { id: "h3", label: "C", plus_ones: 0, invite_token: "t3", rsvp_code: "Z", guests: [{ id: "g3", first_name: "C", last_name: "", is_child: false, sort: 0 }], guest_event_invites: [] },
  ];
  const db = (siteRow: unknown) =>
    mockSb(
      {
        ...project,
        wedding_sites: { data: siteRow },
        guests: { data: [{ household_id: "h1", email: "a@x.co" }, { household_id: "h2", email: "b@x.co" }, { household_id: "h3", email: "c@x.co" }] },
        rsvp_settings: { data: null },
        wedding_events: { data: [] },
        guest_households: { data: households },
        rsvp_responses: { data: [] },
        // h2 already replied; h3 has had 2 reminders
        rsvp_households: [
          { data: [{ household_id: "h2", plus_ones: [], answers: {}, responded_at: "2027-01-01", reminders_sent: 0 }, { household_id: "h3", plus_ones: [], answers: {}, responded_at: null, reminders_sent: 2 }] },
          { data: null },
        ],
      },
      { data: true }
    );

  it("needs a published website", async () => {
    const send = vi.fn();
    expect((await sendRsvpReminders(db({ slug: "ps", published_at: null }).sb, "u1", { send, siteUrl: "https://k" })).ok).toBe(false);
  });

  it("emails only households that haven't replied and haven't had 2 reminders, with their link", async () => {
    const send = vi.fn().mockResolvedValue({});
    const { sb, called } = db({ slug: "ps", published_at: "2027-01-01" });
    expect(await sendRsvpReminders(sb, "u1", { send, siteUrl: "https://k" })).toEqual({ ok: true, data: { sent: 1 } });
    expect(send.mock.calls).toHaveLength(1);
    expect(send.mock.calls[0][0]).toBe("a@x.co");
    expect(send.mock.calls[0][3]).toBe("https://k/w/ps/rsvp?t=t1");
    expect(called("rsvp_households", "insert")[0].args[0]).toMatchObject({ household_id: "h1", reminders_sent: 1 });
  });
});
