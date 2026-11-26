import { describe, it, expect } from "vitest";
import { chunk, defaultDesign, invitationEmail, sendable } from "./invitations";

const card = {
  kind: "invitation" as const,
  design: { ...defaultDesign("invitation"), message: 'Line 1\nLine <2> & "3"' },
  theme: "classic" as const,
  names: "Priya & Sam",
  date: "Saturday, October 16, 2027",
  place: "Charlotte, NC",
  photoUrl: null,
  link: "https://knotly.net/w/ps/rsvp?t=abc",
  householdLabel: "The Patels",
};

describe("invitationEmail", () => {
  it("builds subject, escaped HTML and a text version", () => {
    const e = invitationEmail(card);
    expect(e.subject).toBe("You're invited: Priya & Sam, Saturday, October 16, 2027");
    expect(e.html).toContain("Priya &amp; Sam");
    expect(e.html).toContain("Line 1<br>Line &lt;2&gt; &amp; &quot;3&quot;");
    expect(e.html).toContain('href="https://knotly.net/w/ps/rsvp?t=abc"');
    expect(e.html).toContain("Dear The Patels");
    expect(e.text).toContain("RSVP: https://knotly.net/w/ps/rsvp?t=abc");
    expect(e.html).not.toContain("<img");
  });

  it("uses a website button for save-the-dates", () => {
    expect(invitationEmail({ ...card, kind: "save_the_date", design: defaultDesign("save_the_date") }).html).toContain("Visit our website");
  });
});

describe("sendable / chunk", () => {
  it("keeps selected households with an email and fewer than 2 sends", () => {
    const r = [
      { householdId: "a", label: "A", emails: ["a@x.co"], sent: 0, lastSent: null },
      { householdId: "b", label: "B", emails: [], sent: 0, lastSent: null },
      { householdId: "c", label: "C", emails: ["c@x.co"], sent: 2, lastSent: null },
      { householdId: "d", label: "D", emails: ["d@x.co"], sent: 1, lastSent: null },
    ];
    expect(sendable(r, ["a", "b", "c", "d"]).map((x) => x.householdId)).toEqual(["a", "d"]);
    expect(sendable(r, ["d"]).map((x) => x.householdId)).toEqual(["d"]);
  });

  it("splits into batches", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
