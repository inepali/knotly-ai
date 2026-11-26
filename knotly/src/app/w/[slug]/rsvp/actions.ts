"use server";
// Public RSVP: find your invitation, then send your answers. Everything runs as the service role
// after checking the site (published, unlocked, RSVP active) and the household's personal token.
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { guestQuota, openSiteFor } from "@/lib/public-site-access";
import { loadRsvpData, saveRsvp } from "@/lib/rsvp-data";
import { findHouseholds, isClosed, validateSubmission, type Submission } from "@/lib/rsvp";

const FIND_PER_DAY = 40;
const SUBMIT_PER_DAY = 30;

const openSite = (slug: string) => openSiteFor(slug, "rsvp");
const quota = (kind: string, limit: number) => guestQuota(`rsvp-${kind}`, limit);

export async function findRsvpAction(
  slug: string,
  name: string,
  code: string
): Promise<{ ok: true; matches: { token: string; label: string }[] } | { ok: false; error: string }> {
  const site = await openSite(slug);
  if (!site) return { ok: false, error: "RSVP isn't open on this site." };
  if (name.length > 100 || code.length > 12) return { ok: false, error: "Try a shorter name." };
  if (!(await quota("find", FIND_PER_DAY))) return { ok: false, error: "Too many searches today. Please use the link from your invitation." };
  const data = await loadRsvpData(supabaseAdmin, site.projectId);
  if (data.settings.require_code && !code.trim()) return { ok: false, error: "Enter the code from your invitation." };
  const matches = findHouseholds(data.households, name, code, data.settings.require_code);
  if (!matches.length) {
    return { ok: false, error: "We couldn't find that invitation. Type your first and last name as on the envelope." };
  }
  return { ok: true, matches: matches.map((h) => ({ token: h.invite_token, label: h.label })) };
}

export async function submitRsvpAction(slug: string, token: string, sub: Submission): Promise<{ ok: boolean; error?: string }> {
  const site = await openSite(slug);
  if (!site) return { ok: false, error: "RSVP isn't open on this site." };
  if (!(await quota("submit", SUBMIT_PER_DAY))) return { ok: false, error: "Too many tries today. Please contact the couple." };
  const data = await loadRsvpData(supabaseAdmin, site.projectId);
  if (isClosed(data.settings.deadline)) return { ok: false, error: "RSVPs are closed. Please contact the couple directly." };
  const household = data.households.find((h) => h.invite_token === token);
  if (!household) return { ok: false, error: "This RSVP link isn't valid." };
  const v = validateSubmission(sub, household, data.events, data.settings);
  if (!v.ok) return v;
  const r = await saveRsvp(supabaseAdmin, household, v.rows, v.household);
  if (!r.ok) {
    console.error("[rsvp] save", r.error);
    return { ok: false, error: "We couldn't save your RSVP. Please try again." };
  }
  revalidatePath(`/w/${site.slug}/rsvp`);
  return { ok: true };
}
