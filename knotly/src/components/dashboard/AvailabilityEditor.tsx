// src/components/dashboard/AvailabilityEditor.tsx — blocked/booked dates and weekly consultation windows.
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { fieldClasses, panelClasses } from "@/components/ui/fields";
import { saveConsultHoursAction, setAvailabilityAction } from "@/app/vendor/dashboard/actions";
import { useAction, wholeNumber } from "./useAction";

type Manual = { date: string; status: "blocked" | "booked" };
type Hold = { date: string; expires: string | null };
type Window = { weekday: number; startTime: string; endTime: string; timezone: string; slotMinutes: number };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const longDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

export default function AvailabilityEditor(props: {
  manual: Manual[];
  holds: Hold[];
  hours: Window[];
  callLink: string;
  minNotice: number;
  callsPerDay: number;
}) {
  return (
    <div className="mt-6 space-y-6">
      <Dates manual={props.manual} holds={props.holds} />
      <CallHours hours={props.hours} callLink={props.callLink} minNotice={props.minNotice} callsPerDay={props.callsPerDay} />
    </div>
  );
}

function Dates({ manual, holds }: { manual: Manual[]; holds: Hold[] }) {
  const act = useAction();
  const [picked, setPicked] = useState<string[]>([]);
  const [status, setStatus] = useState<"blocked" | "booked">("blocked");
  const [date, setDate] = useState("");

  return (
    <section className={`${panelClasses} p-6`}>
      <h2 className="text-base font-semibold">Dates</h2>
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!picked.length) return;
          act.run(() => setAvailabilityAction({ dates: picked, status }), () => setPicked([]));
        }}
      >
        <input
          type="date"
          aria-label="Date to add"
          className={`${fieldClasses} w-44`}
          value={date}
          min={new Date().toISOString().slice(0, 10)}
          onChange={(e) => {
            const d = e.target.value;
            if (d && !picked.includes(d)) setPicked((s) => [...s, d].sort());
            setDate("");
          }}
        />
        <select aria-label="Mark as" className={`${fieldClasses} w-32`} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="blocked">Blocked</option>
          <option value="booked">Booked</option>
        </select>
        <Button type="submit" color="cyan" disabled={act.pending || !picked.length}>
          {picked.length ? `Mark ${picked.length} date${picked.length === 1 ? "" : "s"}` : "Pick dates"}
        </Button>
      </form>
      {picked.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2 text-xs">
          {picked.map((d) => (
            <li key={d} className="rounded-full bg-gray-100 px-2 py-1">
              {longDate(d)}{" "}
              <button type="button" aria-label={`Remove ${d}`} className="text-gray-500" onClick={() => setPicked((s) => s.filter((x) => x !== d))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-6 text-sm font-semibold">Coming up</h3>
      {manual.length === 0 && holds.length === 0 ? (
        <p className="mt-1 text-sm text-gray-500">Nothing blocked or booked.</p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100 text-sm">
          {manual.map((m) => (
            <li key={m.date + m.status} className="flex items-center justify-between py-2">
              <span>
                {longDate(m.date)} <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs">{m.status}</span>
              </span>
              <button
                type="button"
                className="text-cyan-700 underline disabled:opacity-50"
                disabled={act.pending}
                onClick={() => act.run(() => setAvailabilityAction({ dates: [m.date], status: "free" }))}
              >
                Free up
              </button>
            </li>
          ))}
          {holds.map((h) => (
            <li key={h.date + "hold"} className="flex items-center justify-between py-2 text-gray-600">
              <span>
                {longDate(h.date)} <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">held for a couple</span>
              </span>
              {h.expires && <span className="text-xs">until {new Date(h.expires).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
            </li>
          ))}
        </ul>
      )}
      {act.error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {act.error}
        </p>
      )}
    </section>
  );
}

function CallHours({ hours, callLink, minNotice, callsPerDay }: { hours: Window[]; callLink: string; minNotice: number; callsPerDay: number }) {
  const save = useAction();
  const [rows, setRows] = useState<Window[]>(hours);
  const [link, setLink] = useState(callLink);
  const [notice, setNotice] = useState(String(minNotice));
  const [perDay, setPerDay] = useState(String(callsPerDay));

  const change = (i: number, patch: Partial<Window>) => setRows((s) => s.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <section className={`${panelClasses} p-6`}>
      <h2 className="text-base font-semibold">Consultation calls</h2>
      <p className="mt-1 text-sm text-gray-600">Weekly windows when couples can book a call with you. Leave empty if you don&apos;t take calls.</p>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.run(
            () =>
              saveConsultHoursAction({
                hours: rows,
                callLink: link.trim() || null,
                callMinNoticeHours: wholeNumber(notice),
                callsPerDay: wholeNumber(perDay),
              }),
            undefined,
            "Saved."
          );
        }}
      >
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <select aria-label="Weekday" className={`${fieldClasses} w-36`} value={r.weekday} onChange={(e) => change(i, { weekday: Number(e.target.value) })}>
                {WEEKDAYS.map((d, k) => (
                  <option key={d} value={k}>
                    {d}
                  </option>
                ))}
              </select>
              <input type="time" aria-label="From" className={`${fieldClasses} w-32`} value={r.startTime} onChange={(e) => change(i, { startTime: e.target.value })} required />
              <span className="text-gray-500">to</span>
              <input type="time" aria-label="Until" className={`${fieldClasses} w-32`} value={r.endTime} onChange={(e) => change(i, { endTime: e.target.value })} required />
              <select aria-label="Call length" className={`${fieldClasses} w-28`} value={r.slotMinutes} onChange={(e) => change(i, { slotMinutes: Number(e.target.value) })}>
                {[15, 30, 45, 60, 90, 120].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
              <button type="button" className="text-sm text-red-600 underline" onClick={() => setRows((s) => s.filter((_, j) => j !== i))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="text-sm text-cyan-700 underline"
          onClick={() => setRows((s) => [...s, { weekday: 1, startTime: "09:00", endTime: "12:00", timezone: s.at(-1)?.timezone ?? "America/New_York", slotMinutes: 30 }])}
        >
          + Add a window
        </button>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs text-gray-600 sm:col-span-3">
            Call link or phone instructions
            <input className={`${fieldClasses} mt-1`} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://zoom.us/j/… or “I'll call you”" maxLength={500} />
          </label>
          <label className="block text-xs text-gray-600">
            Minimum notice (hours)
            <input inputMode="numeric" className={`${fieldClasses} mt-1`} value={notice} onChange={(e) => setNotice(e.target.value)} />
          </label>
          <label className="block text-xs text-gray-600">
            Calls per day (max)
            <input inputMode="numeric" className={`${fieldClasses} mt-1`} value={perDay} onChange={(e) => setPerDay(e.target.value)} />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" color="gray" disabled={save.pending}>
            {save.pending ? "Saving…" : "Save call settings"}
          </Button>
          {save.error && (
            <p role="alert" className="text-sm text-red-600">
              {save.error}
            </p>
          )}
          {save.notice && <p className="text-sm text-emerald-700">{save.notice}</p>}
        </div>
      </form>
    </section>
  );
}
