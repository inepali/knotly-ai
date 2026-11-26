// src/components/guests/EventsEditor.tsx — the wedding's events (ceremony, reception…), so households
// can be invited to some or all of them. The Website schedule will use these too.
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { fieldClasses, panelClasses } from "@/components/ui/fields";
import { useAction } from "@/components/dashboard/useAction";
import { deleteEventAction, saveEventAction } from "@/app/client/dashboard/actions";
import type { WeddingEvent } from "@/lib/guests";

const SUGGESTIONS = ["Ceremony", "Reception", "Rehearsal dinner", "Welcome party", "Mehndi", "Sangeet", "Brunch"];

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

export default function EventsEditor({ events }: { events: WeddingEvent[] }) {
  const save = useAction();
  const del = useAction();
  const [name, setName] = useState("");
  const [at, setAt] = useState(""); // datetime-local value
  const [venue, setVenue] = useState("");

  return (
    <section className={`${panelClasses} space-y-3 p-4 sm:p-6`}>
      <h2 className="text-base font-semibold">Events</h2>
      <p className="text-sm text-gray-600">New households are invited to every event unless you untick some.</p>
      {events.length > 0 && (
        <ul className="divide-y divide-gray-100 text-sm">
          {events.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                <strong>{e.name}</strong>
                {(e.starts_at || e.venue) && <span className="ml-2 text-gray-500">{[when(e.starts_at), e.venue].filter(Boolean).join(" · ")}</span>}
              </span>
              <button
                type="button"
                className="text-red-600 underline disabled:opacity-50"
                disabled={del.pending}
                onClick={() => confirm(`Remove ${e.name}? Invitations to it are removed too.`) && del.run(() => deleteEventAction({ id: e.id }))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          save.run(
            () =>
              saveEventAction({
                name,
                starts_at: at ? new Date(at).toISOString() : null,
                venue,
                sort: events.length,
              }),
            () => {
              setName("");
              setAt("");
              setVenue("");
            }
          );
        }}
      >
        <label className="text-xs text-gray-600">
          Event
          <input list="event-suggestions" className={`${fieldClasses} mt-1 w-48`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ceremony" />
          <datalist id="event-suggestions">
            {SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label className="text-xs text-gray-600">
          When (optional)
          <input type="datetime-local" className={`${fieldClasses} mt-1 w-56`} value={at} onChange={(e) => setAt(e.target.value)} />
        </label>
        <label className="text-xs text-gray-600">
          Where (optional)
          <input className={`${fieldClasses} mt-1 w-48`} value={venue} onChange={(e) => setVenue(e.target.value)} />
        </label>
        <Button type="submit" color="cyan" disabled={save.pending || !name.trim()}>
          Add event
        </Button>
      </form>
      {(save.error || del.error) && <p role="alert" className="text-sm text-red-600">{save.error || del.error}</p>}
    </section>
  );
}
