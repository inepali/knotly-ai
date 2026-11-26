// src/lib/rsvp.ts — RSVP rules with no database: name search, validating a guest's answers,
// deadline, and the couple's summary + CSV.
import { toCsv } from "./guests";

export const MAIN_EVENT = "main"; // key used when the wedding has no events set up
export const MAX_MATCHES = 5;

export type RsvpSettings = {
  deadline: string | null;
  meal_options: string[];
  questions: { id: string; label: string }[];
  require_code: boolean;
  ask_dietary: boolean;
  ask_song: boolean;
};
export const DEFAULT_SETTINGS: RsvpSettings = {
  deadline: null,
  meal_options: [],
  questions: [],
  require_code: false,
  ask_dietary: true,
  ask_song: false,
};

export type RsvpEvent = { id: string; name: string; starts_at?: string | null };
export type RsvpGuest = { id: string; first_name: string; last_name: string; is_child: boolean };
export type RsvpHousehold = {
  id: string;
  label: string;
  plus_ones: number;
  invite_token: string;
  rsvp_code: string;
  guests: RsvpGuest[];
  event_ids: string[];
};
export type Status = "attending" | "declined";
export type ResponseRow = { guest_id: string; event_id: string | null; status: Status; meal: string | null; dietary: string | null };
export type HouseholdAnswers = {
  plus_ones: { name: string; meal: string | null }[];
  answers: Record<string, string>;
  song: string | null;
  note: string | null;
  responded_at: string | null;
};

const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .trim();

/** The events a household answers for: the ones it's invited to, or all of them (or the single "main" one). */
export function householdEvents(h: Pick<RsvpHousehold, "event_ids">, events: RsvpEvent[]): RsvpEvent[] {
  if (!events.length) return [{ id: MAIN_EVENT, name: "The wedding" }];
  const invited = events.filter((e) => h.event_ids.includes(e.id));
  return invited.length ? invited : events;
}

/**
 * Households a guest could be. Every word typed must start a first or last name of the same
 * guest (3+ letters, or the whole name), and at least two words are needed, so typing a common
 * name doesn't list the guest list. Code-protected weddings also need the household code.
 */
export function findHouseholds(households: RsvpHousehold[], query: string, code?: string | null, requireCode = false) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (words.length < 2) return [];
  const want = (code ?? "").trim().toUpperCase();
  const hits = households.filter((h) => {
    if (requireCode && h.rsvp_code !== want) return false;
    return h.guests.some((g) => {
      const names = [...norm(g.first_name).split(/\s+/), ...norm(g.last_name).split(/\s+/)].filter(Boolean);
      return words.every((w) => names.some((n) => n === w || (w.length >= 3 && n.startsWith(w))));
    });
  });
  return hits.slice(0, MAX_MATCHES);
}

export function isClosed(deadline: string | null | undefined, now = new Date()): boolean {
  if (!deadline) return false;
  // Open through the end of the deadline day (Eastern time; the launch metros are all on it).
  const end = new Date(`${deadline}T23:59:59-05:00`);
  return now.getTime() > end.getTime();
}

export type Submission = {
  guests: { guest_id: string; events: Record<string, Status>; meal?: string | null; dietary?: string | null }[];
  plus_ones?: { name: string; meal?: string | null }[];
  answers?: Record<string, string>;
  song?: string | null;
  note?: string | null;
  website?: string; // honeypot: real people never fill this in
};

const clip = (s: string | null | undefined, max: number) => {
  const t = (s ?? "").trim().slice(0, max);
  return t || null;
};

/** Check a submission against the household and settings; rows to save, or the first problem. */
export function validateSubmission(
  sub: Submission,
  h: RsvpHousehold,
  events: RsvpEvent[],
  settings: RsvpSettings
): { ok: true; rows: ResponseRow[]; household: Omit<HouseholdAnswers, "responded_at"> } | { ok: false; error: string } {
  if (sub.website) return { ok: false, error: "Something went wrong. Please try again." };
  const evs = householdEvents(h, events);
  const byId = new Map(sub.guests.map((g) => [g.guest_id, g]));
  if (byId.size !== sub.guests.length || sub.guests.some((g) => !h.guests.some((x) => x.id === g.guest_id))) {
    return { ok: false, error: "Those guests aren't on this invitation." };
  }
  const meals = settings.meal_options;
  const rows: ResponseRow[] = [];
  for (const g of h.guests) {
    const a = byId.get(g.id);
    if (!a) return { ok: false, error: `Please answer for ${g.first_name}.` };
    const attendingAny = evs.some((e) => a.events[e.id] === "attending");
    let meal = clip(a.meal, 60);
    if (!attendingAny) meal = null;
    else if (meals.length && (!meal || !meals.includes(meal))) return { ok: false, error: `Choose a meal for ${g.first_name}.` };
    else if (!meals.length) meal = null;
    for (const e of evs) {
      const status = a.events[e.id];
      if (status !== "attending" && status !== "declined") {
        return { ok: false, error: `Let us know if ${g.first_name} can make it to ${e.name}.` };
      }
      rows.push({
        guest_id: g.id,
        event_id: e.id === MAIN_EVENT ? null : e.id,
        status,
        meal: status === "attending" ? meal : null,
        dietary: settings.ask_dietary && attendingAny ? clip(a.dietary, 200) : null,
      });
    }
  }

  const anyoneComing = rows.some((r) => r.status === "attending");
  const plus = (sub.plus_ones ?? []).map((p) => ({ name: clip(p.name, 60), meal: clip(p.meal, 60) })).filter((p) => p.name);
  if (plus.length > h.plus_ones) return { ok: false, error: `This invitation includes ${h.plus_ones} plus-one${h.plus_ones === 1 ? "" : "s"}.` };
  if (plus.length && !anyoneComing) return { ok: false, error: "A plus-one can only come with someone who's attending." };
  for (const p of plus) {
    if (meals.length && (!p.meal || !meals.includes(p.meal))) return { ok: false, error: `Choose a meal for ${p.name}.` };
    if (!meals.length) p.meal = null;
  }

  const answers: Record<string, string> = {};
  for (const q of settings.questions) {
    const v = clip(sub.answers?.[q.id], 500);
    if (v) answers[q.id] = v;
  }
  return {
    ok: true,
    rows,
    household: {
      plus_ones: plus as { name: string; meal: string | null }[],
      answers,
      song: settings.ask_song ? clip(sub.song, 120) : null,
      note: clip(sub.note, 1000),
    },
  };
}

// ---------- couple's view ----------

export type Summary = {
  byEvent: Record<string, { attending: number; declined: number; waiting: number }>;
  meals: Record<string, number>;
  responded: number;
  waiting: RsvpHousehold[];
  plusOnes: number;
};

export function summarize(
  households: RsvpHousehold[],
  events: RsvpEvent[],
  responses: ResponseRow[],
  answers: Map<string, HouseholdAnswers>
): Summary {
  const s: Summary = { byEvent: {}, meals: {}, responded: 0, waiting: [], plusOnes: 0 };
  const key = (id: string | null) => id ?? MAIN_EVENT;
  for (const h of households) {
    const a = answers.get(h.id);
    if (a?.responded_at) s.responded++;
    else s.waiting.push(h);
    const extra = a?.responded_at ? a.plus_ones.length : 0;
    s.plusOnes += extra;
    for (const p of a?.responded_at ? a.plus_ones : []) if (p.meal) s.meals[p.meal] = (s.meals[p.meal] ?? 0) + 1;
    const mealCounted = new Set<string>();
    for (const e of householdEvents(h, events)) {
      const c = (s.byEvent[e.id] ??= { attending: 0, declined: 0, waiting: 0 });
      for (const g of h.guests) {
        const r = responses.find((x) => x.guest_id === g.id && key(x.event_id) === e.id);
        if (!r) c.waiting++;
        else if (r.status === "attending") {
          c.attending++;
          if (r.meal && !mealCounted.has(g.id)) {
            s.meals[r.meal] = (s.meals[r.meal] ?? 0) + 1;
            mealCounted.add(g.id);
          }
        } else c.declined++;
      }
      c.attending += extra; // plus-ones come to every event their household attends
    }
  }
  return s;
}

/** One row per guest per event, plus plus-ones, for the couple's spreadsheet. */
export function responsesCsv(
  households: RsvpHousehold[],
  events: RsvpEvent[],
  responses: ResponseRow[],
  answers: Map<string, HouseholdAnswers>,
  settings: RsvpSettings
): string {
  const qs = settings.questions;
  const rows: string[][] = [["Household", "Guest", "Event", "Response", "Meal", "Dietary", "Song", "Note", ...qs.map((q) => q.label)]];
  for (const h of households) {
    const a = answers.get(h.id);
    const tail = [a?.song ?? "", a?.note ?? "", ...qs.map((q) => a?.answers[q.id] ?? "")];
    for (const e of householdEvents(h, events)) {
      for (const g of h.guests) {
        const r = responses.find((x) => x.guest_id === g.id && (x.event_id ?? MAIN_EVENT) === e.id);
        rows.push([h.label, `${g.first_name} ${g.last_name}`.trim(), e.name, r ? r.status : "no response", r?.meal ?? "", r?.dietary ?? "", ...tail]);
      }
      for (const p of a?.responded_at ? a.plus_ones : []) rows.push([h.label, `${p.name} (plus-one)`, e.name, "attending", p.meal ?? "", "", ...tail]);
    }
  }
  return toCsv(rows);
}
