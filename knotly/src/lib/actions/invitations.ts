// src/lib/actions/invitations.ts — Save-the-Dates & Invitations (add-on): designs and sending.
import { z } from "zod";
import { chunk, defaultDesign, invitationEmail, MAX_PER_SEND, sendable, type Design, type Kind, type Recipient } from "@/lib/invitations";
import { formatWeddingDate, sitePhotoUrl, type SitePhoto, type ThemeKey } from "@/lib/wedding-site";
import type { OutgoingEmail } from "@/lib/email";
import { getProject } from "./wedding";
import { fail, ok, parseInput, type Sb } from "./result";

const LOCKED = "Unlock Save-the-Dates & Invitations first.";
const KindSchema = z.enum(["save_the_date", "invitation"]);

export const SaveDesignInput = z.object({
  kind: KindSchema,
  template: z.enum(["classic", "modern", "garden", "minimal"]),
  heading: z.string().trim().max(80),
  message: z.string().trim().max(800),
  details: z.string().trim().max(300),
  show_photo: z.boolean(),
});
export type SaveDesignInput = z.input<typeof SaveDesignInput>;
export const SendInvitationsInput = z.object({ kind: KindSchema, householdIds: z.array(z.uuid()).min(1).max(MAX_PER_SEND) });
export type SendInvitationsInput = z.input<typeof SendInvitationsInput>;

async function ctx(sb: Sb, userId: string) {
  const project = await getProject(sb, userId);
  if (!project) return null;
  const { data: active } = await sb.rpc("has_addon", { p_project: project.id, p_key: "invitations" });
  const { data: rsvp } = await sb.rpc("has_addon", { p_project: project.id, p_key: "rsvp" });
  return { project, active: !!active, rsvp: !!rsvp };
}
const NO_PROJECT = "Save your wedding details on My Wedding first.";

/** Everything both the editor and the print page need. */
export async function loadInvitations(sb: Sb, userId: string) {
  const c = await ctx(sb, userId);
  if (!c) return fail(NO_PROJECT);
  const pid = c.project.id as string;
  const [{ data: designs }, { data: site }, { data: hh }, { data: sends }, { data: metro }] = await Promise.all([
    sb.from("invitation_designs").select("kind, template, heading, message, details, show_photo").eq("project_id", pid),
    sb.from("wedding_sites").select("slug, theme, title, photos, published_at").eq("project_id", pid).maybeSingle(),
    sb.from("guest_households").select("id, label, invite_token, rsvp_code, guests(email)").eq("project_id", pid).order("created_at"),
    sb.from("invitation_sends").select("household_id, kind, status, sent_at").eq("project_id", pid).order("sent_at"),
    c.project.metro_slug ? sb.from("metros").select("name, state").eq("slug", c.project.metro_slug).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const design = (k: Kind): Design => {
    const d = (designs ?? []).find((x) => x.kind === k);
    return d ? (d as unknown as Design) : defaultDesign(k);
  };
  const households = ((hh ?? []) as { id: string; label: string; invite_token: string; rsvp_code: string; guests: { email: string | null }[] }[]).map((h) => ({
    id: h.id,
    label: h.label,
    invite_token: h.invite_token,
    rsvp_code: h.rsvp_code,
    emails: [...new Set(h.guests.map((g) => g.email).filter((e): e is string => !!e))],
  }));
  const recipients = (k: Kind): Recipient[] =>
    households.map((h) => {
      const mine = (sends ?? []).filter((s) => s.household_id === h.id && s.kind === k && s.status === "sent");
      // Each send to a household counts once, however many guests in it have an email.
      const times = new Set(mine.map((s) => String(s.sent_at).slice(0, 16)));
      return { householdId: h.id, label: h.label, emails: h.emails, sent: times.size, lastSent: mine.at(-1)?.sent_at ?? null };
    });
  const photos = ((site?.photos ?? []) as SitePhoto[]) ?? [];
  const m = metro as { name: string; state: string } | null;
  return ok({
    active: c.active,
    rsvp: c.rsvp,
    site: site ? { slug: site.slug as string, published: !!site.published_at, theme: (site.theme as ThemeKey) ?? "classic" } : null,
    names: ((site?.title as string | null) || (c.project.partner_names as string | null) || "Our wedding") as string,
    date: formatWeddingDate(c.project.wedding_date as string | null),
    place: [c.project.venue, m ? `${m.name}, ${m.state}` : null].filter(Boolean).join(" · "),
    photoUrl: photos[0] ? sitePhotoUrl(photos[0].path) : null,
    designs: { save_the_date: design("save_the_date"), invitation: design("invitation") },
    households,
    recipients: { save_the_date: recipients("save_the_date"), invitation: recipients("invitation") },
  });
}
export type InvitationsData = Extract<Awaited<ReturnType<typeof loadInvitations>>, { ok: true }>["data"];

/** Where a household's card points: their personal RSVP link for invitations (with RSVP), else the site. */
export function cardLink(d: Pick<InvitationsData, "site" | "rsvp">, kind: Kind, token: string, siteUrl: string) {
  if (!d.site) return siteUrl;
  return kind === "invitation" && d.rsvp ? `${siteUrl}/w/${d.site.slug}/rsvp?t=${token}` : `${siteUrl}/w/${d.site.slug}`;
}

export async function saveDesign(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(SaveDesignInput, input);
  if (!p.ok) return p;
  const c = await ctx(sb, userId);
  if (!c) return fail(NO_PROJECT);
  if (!c.active) return fail(LOCKED);
  const { error } = await sb
    .from("invitation_designs")
    .upsert({ project_id: c.project.id, ...p.data, updated_at: new Date().toISOString() }, { onConflict: "project_id,kind" });
  return error ? fail(error.message) : ok({ saved: p.data.kind });
}

export type SendDeps = {
  sendBatch: (emails: OutgoingEmail[]) => Promise<{ ids: (string | null)[]; error?: string }>;
  siteUrl: string;
};

/** Email the chosen households (each guest with an email in them), at most twice per kind. */
export async function sendInvitations(sb: Sb, userId: string, input: unknown, deps: SendDeps) {
  const p = parseInput(SendInvitationsInput, input);
  if (!p.ok) return p;
  const loaded = await loadInvitations(sb, userId);
  if (!loaded.ok) return loaded;
  const d = loaded.data;
  if (!d.active) return fail(LOCKED);
  if (!d.site?.published) return fail("Publish your wedding website first, so the button in the email works.");
  const { kind, householdIds } = p.data;
  const to = sendable(d.recipients[kind], householdIds);
  if (!to.length) return fail("None of those households can get one: they need an email, and each gets at most 2.");

  const project = (await getProject(sb, userId))!;
  const sentAt = new Date().toISOString();
  const emails: (OutgoingEmail & { householdId: string })[] = [];
  for (const r of to) {
    const h = d.households.find((x) => x.id === r.householdId)!;
    const card = invitationEmail({
      kind,
      design: d.designs[kind],
      theme: d.site.theme,
      names: d.names,
      date: d.date,
      place: d.place,
      photoUrl: d.photoUrl,
      link: cardLink(d, kind, h.invite_token, deps.siteUrl),
      householdLabel: h.label,
    });
    for (const email of r.emails) emails.push({ ...card, to: email, householdId: r.householdId });
  }

  let sent = 0;
  let failed = 0;
  for (const batch of chunk(emails, 50)) {
    const res = await deps.sendBatch(batch.map(({ householdId: _h, ...e }) => e));
    const rows = batch.map((e, i) => ({
      project_id: project.id,
      household_id: e.householdId,
      kind,
      email: e.to,
      provider_id: res.ids[i],
      status: res.error || !res.ids[i] ? "failed" : "sent",
      error: res.error ? res.error.slice(0, 300) : null,
      sent_at: sentAt,
    }));
    const { error } = await sb.from("invitation_sends").insert(rows);
    if (error) return fail(`Emails went out, but we couldn't log them: ${error.message}`);
    sent += rows.filter((r) => r.status === "sent").length;
    failed += rows.filter((r) => r.status === "failed").length;
  }
  return ok({ households: to.length, sent, failed });
}
