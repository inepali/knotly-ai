// src/components/dashboard/AvailabilityEditor.tsx — the availability calendar, calendar sync, and weekly consultation windows.
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { fieldClasses, panelClasses } from "@/components/ui/fields";
import { saveConsultHoursAction } from "@/app/vendor/dashboard/actions";
import AvailabilityCalendar, { type Hold, type Manual } from "./AvailabilityCalendar";
import CalendarSync from "./CalendarSync";
import { useAction, wholeNumber } from "./useAction";

type Window = { weekday: number; startTime: string; endTime: string; timezone: string; slotMinutes: number };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function AvailabilityEditor(props: {
  serverToday: string;
  manual: Manual[];
  holds: Hold[];
  coupleBooked: string[];
  feedUrl: string | null;
  hours: Window[];
  callLink: string;
  minNotice: number;
  callsPerDay: number;
}) {
  return (
    <div className="mt-6 space-y-6">
      <AvailabilityCalendar serverToday={props.serverToday} manual={props.manual} holds={props.holds} coupleBooked={props.coupleBooked} />
      {props.feedUrl && <CalendarSync feedUrl={props.feedUrl} />}
      <CallHours hours={props.hours} callLink={props.callLink} minNotice={props.minNotice} callsPerDay={props.callsPerDay} />
    </div>
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
