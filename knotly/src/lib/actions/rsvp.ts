// src/lib/actions/rsvp.ts — the couple's side of RSVP (add-on): settings, responses, reminders.
import { z } from "zod";
import { loadRsvpData } from "@/lib/rsvp-data";
import { summarize } from "@/lib/rsvp";
import { getProject } from "./wedding";
import { fail, ok, parseInput, type Sb } from "./result";

const LOCKED = "Unlock the RSVP add-on first.";
export const MAX_REMINDERS = 2;

export const SaveRsvpSettingsInput = z.object({
  deadline: z.iso.date().nullish().or(z.literal("")).transform((v) => v || null),
  meal_options: z
    .array(z.string().trim().min(1).max(60))
    .max(8)
    .transform((a) => [...new Set(a)]),
  questions: z
    .array(z.object({ id: z.string().regex(/^q[0-9a-z]{1,12}$/), label: z.string().trim().min(1, "Each question needs text.").max(200) }))
    .max(3),
  require_code: z.boolean(),
  ask_dietary: z.boolean(),
  ask_song: z.boolean(),
});
export type SaveRsvpSettingsInput = z.input<typeof SaveRsvpSettingsInput>;

async function ctx(sb: Sb, userId: string) {
  const project = await getProject(sb, userId);
  if (!project) return null;
  const { data: active } = await sb.rpc("has_addon", { p_project: project.id, p_key: "rsvp" });
  return { project, active: !!active };
}

export async function loadRsvpDashboard(sb: Sb, userId: string) {
  const c = await ctx(sb, userId);
  if (!c) return fail("Save your wedding details on My Wedding first.");
  const data = await loadRsvpData(sb, c.project.id);
  const { data: site } = await sb.from("wedding_sites").select("slug, published_at").eq("project_id", c.project.id).maybeSingle();
  return ok({
    ...data,
    active: c.active,
    site: site as { slug: string; published_at: string | null } | null,
    summary: summarize(data.households, data.events, data.responses, data.answers),
  });
}

export async function saveRsvpSettings(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(SaveRsvpSettingsInput, input);
  if (!p.ok) return p;
  const c = await ctx(sb, userId);
  if (!c) return fail("Save your wedding details on My Wedding first.");
  if (!c.active) return fail(LOCKED);
  const { error } = await sb
    .from("rsvp_settings")
    .upsert({ project_id: c.project.id, ...p.data, updated_at: new Date().toISOString() }, { onConflict: "project_id" });
  return error ? fail(error.message) : ok({ saved: true });
}

export type ReminderDeps = {
  send: (to: string, subject: string, text: string, link: string) => Promise<unknown>;
  siteUrl: string;
};

/**
 * Email households that haven't answered (at most twice each), with their personal RSVP link.
 * Only guests who have an email get one.
 */
export async function sendRsvpReminders(sb: Sb, userId: string, deps: ReminderDeps) {
  const c = await ctx(sb, userId);
  if (!c) return fail("Save your wedding details on My Wedding first.");
  if (!c.active) return fail(LOCKED);
  const { data: site } = await sb.from("wedding_sites").select("slug, published_at").eq("project_id", c.project.id).maybeSingle();
  if (!site?.published_at) return fail("Publish your website first, so the link works.");

  const { data: emails } = await sb
    .from("guests")
    .select("household_id, email, guest_households!inner(project_id)")
    .eq("guest_households.project_id", c.project.id)
    .not("email", "is", null);
  const data = await loadRsvpData(sb, c.project.id);
  const names = (c.project.partner_names as string | null) || "The couple";
  let sent = 0;
  for (const h of data.households) {
    const a = data.answers.get(h.id);
    if (a?.responded_at || (a?.reminders_sent ?? 0) >= MAX_REMINDERS) continue;
    const to = [...new Set((emails ?? []).filter((e) => e.household_id === h.id).map((e) => e.email as string))];
    if (!to.length) continue;
    const link = `${deps.siteUrl}/w/${site.slug}/rsvp?t=${h.invite_token}`;
    const deadline = data.settings.deadline ? ` by ${data.settings.deadline}` : "";
    for (const email of to) {
      await deps.send(email, `Please RSVP for ${names}'s wedding`, `${names} would love to know if you can make it. Please RSVP${deadline}.`, link);
    }
    const r = a
      ? await sb
          .from("rsvp_households")
          .update({ reminders_sent: (a.reminders_sent ?? 0) + 1, last_reminded_at: new Date().toISOString() })
          .eq("household_id", h.id)
      : await sb.from("rsvp_households").insert({ household_id: h.id, reminders_sent: 1, last_reminded_at: new Date().toISOString() });
    if (r.error) return fail(sent ? `Sent ${sent}, then stopped: ${r.error.message}` : r.error.message);
    sent++;
  }
  return ok({ sent });
}
