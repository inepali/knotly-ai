// src/lib/rsvp-data.ts — load and save RSVP data. Takes the database client as a parameter:
// the couple's (RLS) client on the dashboard, the service role on the public RSVP page.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_SETTINGS,
  type HouseholdAnswers,
  type ResponseRow,
  type RsvpEvent,
  type RsvpGuest,
  type RsvpHousehold,
  type RsvpSettings,
} from "./rsvp";

export async function loadRsvpData(db: SupabaseClient, projectId: string) {
  const [{ data: settings }, { data: events }, { data: hh }] = await Promise.all([
    db.from("rsvp_settings").select("deadline, meal_options, questions, require_code, ask_dietary, ask_song").eq("project_id", projectId).maybeSingle(),
    db.from("wedding_events").select("id, name, starts_at").eq("project_id", projectId).order("sort").order("created_at"),
    db
      .from("guest_households")
      .select("id, label, plus_ones, invite_token, rsvp_code, guests(id, first_name, last_name, is_child, sort), guest_event_invites(event_id)")
      .eq("project_id", projectId)
      .order("created_at"),
  ]);
  type Row = Omit<RsvpHousehold, "guests" | "event_ids"> & {
    guests: (RsvpGuest & { sort: number })[];
    guest_event_invites: { event_id: string }[];
  };
  const households: RsvpHousehold[] = ((hh ?? []) as Row[]).map(({ guests, guest_event_invites, ...h }) => ({
    ...h,
    guests: [...guests].sort((a, b) => a.sort - b.sort).map(({ sort: _s, ...g }) => g),
    event_ids: guest_event_invites.map((i) => i.event_id),
  }));
  const ids = households.map((h) => h.id);
  const guestIds = households.flatMap((h) => h.guests.map((g) => g.id));
  const [{ data: responses }, { data: answers }] = await Promise.all([
    guestIds.length
      ? db.from("rsvp_responses").select("guest_id, event_id, status, meal, dietary").in("guest_id", guestIds)
      : Promise.resolve({ data: [] }),
    ids.length
      ? db.from("rsvp_households").select("household_id, plus_ones, answers, song, note, responded_at, reminders_sent").in("household_id", ids)
      : Promise.resolve({ data: [] }),
  ]);
  const answerMap = new Map<string, HouseholdAnswers & { reminders_sent: number }>(
    ((answers ?? []) as (HouseholdAnswers & { household_id: string; reminders_sent: number })[]).map(({ household_id, ...a }) => [household_id, a])
  );
  return {
    settings: { ...DEFAULT_SETTINGS, ...((settings ?? {}) as Partial<RsvpSettings>) } as RsvpSettings,
    events: (events ?? []) as RsvpEvent[],
    households,
    responses: (responses ?? []) as ResponseRow[],
    answers: answerMap,
  };
}

/** Replace a household's answers (service role; the caller has checked the token and validated). */
export async function saveRsvp(
  db: SupabaseClient,
  household: RsvpHousehold,
  rows: ResponseRow[],
  extra: Omit<HouseholdAnswers, "responded_at">
) {
  const del = await db.from("rsvp_responses").delete().in("guest_id", household.guests.map((g) => g.id));
  if (del.error) return { ok: false as const, error: del.error.message };
  const ins = await db.from("rsvp_responses").insert(rows);
  if (ins.error) return { ok: false as const, error: ins.error.message };
  const up = await db
    .from("rsvp_households")
    .upsert({ household_id: household.id, ...extra, responded_at: new Date().toISOString() }, { onConflict: "household_id" });
  if (up.error) return { ok: false as const, error: up.error.message };
  return { ok: true as const };
}
