// src/components/guests/HouseholdForm.tsx — add or edit one household and its guests.
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { fieldClasses, panelClasses } from "@/components/ui/fields";
import { useAction } from "@/components/dashboard/useAction";
import { saveHouseholdAction } from "@/app/client/dashboard/actions";
import { defaultLabel, type Guest, type Household, type Side, type WeddingEvent } from "@/lib/guests";

const blankGuest = (): Guest => ({ first_name: "", last_name: "", is_child: false, email: null, phone: null });

export default function HouseholdForm({
  initial,
  events,
  names,
  onDone,
}: {
  initial?: Household;
  events: WeddingEvent[];
  names: Record<Side, string>;
  onDone: () => void;
}) {
  const save = useAction();
  const [label, setLabel] = useState(initial?.label ?? "");
  const [side, setSide] = useState<Side>(initial?.side ?? "both");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [plusOnes, setPlusOnes] = useState(initial?.plus_ones ?? 0);
  const [address, setAddress] = useState(initial?.address ?? {});
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [guests, setGuests] = useState<Guest[]>(initial?.guests.length ? initial.guests : [blankGuest()]);
  const [eventIds, setEventIds] = useState<string[]>(initial?.event_ids ?? events.map((e) => e.id));

  const setGuest = (i: number, patch: Partial<Guest>) => setGuests((gs) => gs.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const named = guests.filter((g) => g.first_name.trim());

  return (
    <form
      className={`${panelClasses} space-y-4 p-4 sm:p-6`}
      onSubmit={(e) => {
        e.preventDefault();
        save.run(
          () =>
            saveHouseholdAction({
              id: initial?.id,
              label,
              side,
              tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
              plus_ones: plusOnes,
              address,
              notes,
              guests: named.map((g) => ({ ...g, email: g.email || null, phone: g.phone || null })),
              event_ids: eventIds,
            }),
          onDone
        );
      }}
    >
      <h2 className="text-base font-semibold">{initial ? "Edit household" : "Add a household"}</h2>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Who&apos;s in it</legend>
        {guests.map((g, i) => (
          <div key={g.id ?? `new-${i}`} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1.3fr_1fr_auto_auto]">
            <input aria-label="First name" placeholder="First name" className={fieldClasses} value={g.first_name} onChange={(e) => setGuest(i, { first_name: e.target.value })} />
            <input aria-label="Last name" placeholder="Last name" className={fieldClasses} value={g.last_name} onChange={(e) => setGuest(i, { last_name: e.target.value })} />
            <input aria-label="Email" type="email" placeholder="Email (optional)" className={fieldClasses} value={g.email ?? ""} onChange={(e) => setGuest(i, { email: e.target.value })} />
            <input aria-label="Phone" type="tel" placeholder="Phone (optional)" className={fieldClasses} value={g.phone ?? ""} onChange={(e) => setGuest(i, { phone: e.target.value })} />
            <label className="flex items-center gap-1 text-xs text-gray-600">
              <input type="checkbox" checked={g.is_child} onChange={(e) => setGuest(i, { is_child: e.target.checked })} /> Child
            </label>
            <button
              type="button"
              aria-label={`Remove guest ${i + 1}`}
              className="text-sm text-red-600 disabled:opacity-30"
              disabled={guests.length === 1}
              onClick={() => setGuests((gs) => gs.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
        ))}
        {guests.length < 20 && (
          <button type="button" className="text-sm text-cyan-700 underline" onClick={() => setGuests((gs) => [...gs, blankGuest()])}>
            + Add person
          </button>
        )}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          Household name
          <input className={`${fieldClasses} mt-1`} placeholder={defaultLabel(named)} value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label className="text-sm">
          Guest of
          <select className={`${fieldClasses} mt-1`} value={side} onChange={(e) => setSide(e.target.value as Side)}>
            <option value="a">{names.a}</option>
            <option value="b">{names.b}</option>
            <option value="both">Both</option>
          </select>
        </label>
        <label className="text-sm">
          Plus-ones allowed
          <select className={`${fieldClasses} mt-1`} value={plusOnes} onChange={(e) => setPlusOnes(Number(e.target.value))}>
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm sm:col-span-3">
          Tags (comma-separated)
          <input className={`${fieldClasses} mt-1`} placeholder="Family, College, Work" value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
      </div>

      {events.length > 0 && (
        <fieldset className="text-sm">
          <legend className="font-medium">Invited to</legend>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {events.map((ev) => (
              <label key={ev.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={eventIds.includes(ev.id)}
                  onChange={() => setEventIds((ids) => (ids.includes(ev.id) ? ids.filter((x) => x !== ev.id) : [...ids, ev.id]))}
                />
                {ev.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <details className="text-sm" open={!!(initial?.address.street || initial?.notes)}>
        <summary className="cursor-pointer font-medium">Mailing address and notes</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          <input aria-label="Street" placeholder="Street" className={`${fieldClasses} sm:col-span-4`} value={address.street ?? ""} onChange={(e) => setAddress({ ...address, street: e.target.value })} />
          <input aria-label="City" placeholder="City" className={`${fieldClasses} sm:col-span-2`} value={address.city ?? ""} onChange={(e) => setAddress({ ...address, city: e.target.value })} />
          <input aria-label="State" placeholder="State" className={fieldClasses} value={address.state ?? ""} onChange={(e) => setAddress({ ...address, state: e.target.value })} />
          <input aria-label="Zip" placeholder="Zip" className={fieldClasses} value={address.zip ?? ""} onChange={(e) => setAddress({ ...address, zip: e.target.value })} />
          <textarea aria-label="Notes" placeholder="Notes (only you see these)" rows={2} className={`${fieldClasses} sm:col-span-4`} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </details>

      <div className="flex items-center gap-3">
        <Button type="submit" color="cyan" disabled={save.pending || !named.length}>
          {save.pending ? "Saving…" : initial ? "Save" : "Add household"}
        </Button>
        <button type="button" className="text-sm text-gray-600" onClick={onDone}>
          Cancel
        </button>
      </div>
      {save.error && (
        <p role="alert" className="text-sm text-red-600">
          {save.error}
        </p>
      )}
    </form>
  );
}
