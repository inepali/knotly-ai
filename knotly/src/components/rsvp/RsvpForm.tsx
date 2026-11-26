// src/components/rsvp/RsvpForm.tsx — one household's RSVP: each person per event, meals, plus-ones,
// extra questions. Pre-filled when they've answered before, so they can change it until the deadline.
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitRsvpAction } from "@/app/w/[slug]/rsvp/actions";
import { MAIN_EVENT, type HouseholdAnswers, type ResponseRow, type RsvpEvent, type RsvpGuest, type RsvpSettings, type Status } from "@/lib/rsvp";

const field = "w-full rounded-lg border border-black/10 bg-white/90 px-3 py-2 text-gray-900";

type GuestState = { events: Record<string, Status | undefined>; meal: string; dietary: string };

export default function RsvpForm({
  slug,
  token,
  household,
  events,
  settings,
  responses,
  answers,
}: {
  slug: string;
  token: string;
  household: { label: string; plus_ones: number; guests: RsvpGuest[] };
  events: RsvpEvent[];
  settings: RsvpSettings;
  responses: ResponseRow[];
  answers: HouseholdAnswers | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [guests, setGuests] = useState<Record<string, GuestState>>(() =>
    Object.fromEntries(
      household.guests.map((g) => {
        const mine = responses.filter((r) => r.guest_id === g.id);
        return [
          g.id,
          {
            events: Object.fromEntries(events.map((e) => [e.id, mine.find((r) => (r.event_id ?? MAIN_EVENT) === e.id)?.status])),
            meal: mine.find((r) => r.meal)?.meal ?? "",
            dietary: mine.find((r) => r.dietary)?.dietary ?? "",
          },
        ];
      })
    )
  );
  const [plus, setPlus] = useState(() =>
    Array.from({ length: household.plus_ones }, (_, i) => ({ name: answers?.plus_ones[i]?.name ?? "", meal: answers?.plus_ones[i]?.meal ?? "" }))
  );
  const [extra, setExtra] = useState<Record<string, string>>(answers?.answers ?? {});
  const [song, setSong] = useState(answers?.song ?? "");
  const [note, setNote] = useState(answers?.note ?? "");
  const [honey, setHoney] = useState("");

  const set = (id: string, patch: Partial<GuestState>) => setGuests((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
  const anyoneComing = Object.values(guests).some((g) => Object.values(g.events).includes("attending"));

  if (done) {
    return (
      <div className="mt-10 text-center">
        <p className="text-2xl">Thank you!</p>
        <p className="mt-2 opacity-80">{anyoneComing ? "We can't wait to celebrate with you." : "We'll miss you, and thank you for letting us know."}</p>
        <button type="button" className="mt-6 underline" onClick={() => setDone(false)}>Change my answer</button>
      </div>
    );
  }

  return (
    <form
      className="mt-8 space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        start(async () => {
          const r = await submitRsvpAction(slug, token, {
            guests: household.guests.map((g) => ({
              guest_id: g.id,
              events: guests[g.id].events as Record<string, Status>,
              meal: guests[g.id].meal || null,
              dietary: guests[g.id].dietary || null,
            })),
            plus_ones: plus.filter((p) => p.name.trim()),
            answers: extra,
            song,
            note,
            website: honey,
          });
          if (!r.ok) return setError(r.error ?? "Please try again.");
          setDone(true);
          router.refresh();
        });
      }}
    >
      <p className="text-center text-xl">{household.label}</p>
      {answers?.responded_at && <p className="text-center text-sm opacity-70">You&apos;ve already replied. Change anything below.</p>}

      {household.guests.map((g) => {
        const s = guests[g.id];
        const coming = Object.values(s.events).includes("attending");
        return (
          <fieldset key={g.id} className="space-y-3 rounded-2xl p-4" style={{ background: "var(--ws-soft)" }}>
            <legend className="sr-only">{g.first_name}</legend>
            <p className="text-lg">{`${g.first_name} ${g.last_name}`.trim()}</p>
            {events.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{events.length > 1 || e.id !== MAIN_EVENT ? e.name : "Will you be there?"}</span>
                <span className="flex gap-2">
                  {(["attending", "declined"] as const).map((st) => (
                    <label key={st} className="flex items-center gap-1 rounded-full border border-black/10 bg-white/70 px-3 py-1 text-gray-900">
                      <input type="radio" name={`${g.id}-${e.id}`} checked={s.events[e.id] === st} onChange={() => set(g.id, { events: { ...s.events, [e.id]: st } })} />
                      {st === "attending" ? "Joyfully accepts" : "Regretfully declines"}
                    </label>
                  ))}
                </span>
              </div>
            ))}
            {coming && settings.meal_options.length > 0 && (
              <select aria-label={`Meal for ${g.first_name}`} className={field} value={s.meal} onChange={(e) => set(g.id, { meal: e.target.value })}>
                <option value="">Choose a meal…</option>
                {settings.meal_options.map((m) => <option key={m}>{m}</option>)}
              </select>
            )}
            {coming && settings.ask_dietary && (
              <input aria-label={`Dietary needs for ${g.first_name}`} placeholder="Allergies or dietary needs (optional)" maxLength={200} className={field} value={s.dietary} onChange={(e) => set(g.id, { dietary: e.target.value })} />
            )}
          </fieldset>
        );
      })}

      {household.plus_ones > 0 && anyoneComing && (
        <fieldset className="space-y-2 rounded-2xl p-4" style={{ background: "var(--ws-soft)" }}>
          <legend className="sr-only">Plus-ones</legend>
          <p className="text-lg">Bringing a guest?</p>
          {plus.map((p, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-2">
              <input aria-label={`Plus-one ${i + 1} name`} placeholder="Their full name" maxLength={60} className={field} value={p.name} onChange={(e) => setPlus(plus.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              {settings.meal_options.length > 0 && (
                <select aria-label={`Meal for plus-one ${i + 1}`} className={field} value={p.meal} onChange={(e) => setPlus(plus.map((x, j) => (j === i ? { ...x, meal: e.target.value } : x)))}>
                  <option value="">Meal…</option>
                  {settings.meal_options.map((m) => <option key={m}>{m}</option>)}
                </select>
              )}
            </div>
          ))}
        </fieldset>
      )}

      {settings.questions.map((q) => (
        <label key={q.id} className="block text-sm">
          {q.label}
          <input className={`${field} mt-1`} maxLength={500} value={extra[q.id] ?? ""} onChange={(e) => setExtra({ ...extra, [q.id]: e.target.value })} />
        </label>
      ))}
      {settings.ask_song && anyoneComing && (
        <label className="block text-sm">
          A song that will get you dancing
          <input className={`${field} mt-1`} maxLength={120} value={song} onChange={(e) => setSong(e.target.value)} />
        </label>
      )}
      <label className="block text-sm">
        A note for the couple (optional)
        <textarea className={`${field} mt-1`} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {/* Honeypot: hidden from people, filled in by bots. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={honey} onChange={(e) => setHoney(e.target.value)} />

      <button type="submit" disabled={pending} className="w-full rounded-lg px-3 py-3 font-semibold text-white disabled:opacity-50" style={{ background: "var(--ws-accent)" }}>
        {pending ? "Sending…" : answers?.responded_at ? "Update my RSVP" : "Send RSVP"}
      </button>
      {error && <p role="alert" className="text-center text-sm text-red-600">{error}</p>}
    </form>
  );
}
