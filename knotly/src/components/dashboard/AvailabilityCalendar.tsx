// src/components/dashboard/AvailabilityCalendar.tsx — a month calendar of named events.
// Click a day to add an event (a title like the couple's names, plus details), or to read,
// edit or remove one in a modal. Past days are locked.
"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { fieldClasses, panelClasses } from "@/components/ui/fields";
import { setAvailabilityAction } from "@/app/vendor/dashboard/actions";
import { useAction } from "./useAction";

export type Manual = { date: string; status: "blocked" | "booked"; title: string | null; details: string | null };
export type Hold = { date: string; expires: string | null };
export type CoupleBooking = { date: string; label: string | null }; // booked through a conversation

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_SPAN = 60; // days one event can cover
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const localToday = () => {
  const n = new Date();
  return iso(n.getFullYear(), n.getMonth(), n.getDate());
};
const noopSubscribe = () => () => {};
const longDate = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

/** Every date from `from` to `to`, inclusive (just `from` when `to` is empty or earlier). */
function span(from: string, to: string) {
  const out = [from];
  if (!to || to <= from) return out;
  const d = new Date(`${from}T12:00:00Z`);
  while (out.length < MAX_SPAN) {
    d.setUTCDate(d.getUTCDate() + 1);
    const next = d.toISOString().slice(0, 10);
    if (next > to) break;
    out.push(next);
  }
  return out;
}

export default function AvailabilityCalendar({
  serverToday,
  manual,
  holds,
  coupleBooked,
}: {
  serverToday: string;
  manual: Manual[];
  holds: Hold[];
  coupleBooked: CoupleBooking[];
}) {
  // The vendor's own "today" (their browser), without a hydration mismatch.
  const today = useSyncExternalStore(noopSubscribe, localToday, () => serverToday);
  const [month, setMonth] = useState<{ y: number; m: number } | null>(null);
  const [openDate, setOpenDate] = useState<string | null>(null);

  const [ty, tm] = today.split("-").map(Number);
  const view = month ?? { y: ty, m: tm - 1 };
  const canGoBack = view.y > ty || (view.y === ty && view.m > tm - 1);

  const manualBy = new Map(manual.map((r) => [r.date, r]));
  const heldBy = new Map(holds.map((h) => [h.date, h]));
  const coupleBy = new Map(coupleBooked.map((c) => [c.date, c]));

  const first = new Date(view.y, view.m, 1);
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<null>(first.getDay()).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => iso(view.y, view.m, i + 1)),
  ];
  const move = (delta: number) => {
    const d = new Date(view.y, view.m + delta, 1);
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <section className={`${panelClasses} p-6`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{first.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Previous month"
            disabled={!canGoBack}
            onClick={() => move(-1)}
            className="rounded-lg border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => move(1)}
            className="rounded-lg border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
          >
            ›
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-medium text-gray-500">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={`blank-${i}`} />;
          const past = date < today;
          const mine = manualBy.get(date);
          const couple = coupleBy.get(date);
          const hold = heldBy.get(date);
          const status = couple ? "booked" : (mine?.status ?? (hold ? "held" : null));
          const label = couple ? (couple.label ?? "Knotly") : mine ? (mine.title ?? (mine.status === "blocked" ? "Blocked" : "Booked")) : hold ? "Held" : null;
          return (
            <button
              key={date}
              type="button"
              disabled={past}
              onClick={() => setOpenDate(date)}
              aria-label={`${date}${label ? `, ${label}` : ", free"}`}
              className={clsx(
                "flex aspect-square min-h-16 flex-col items-center justify-start gap-0.5 overflow-hidden rounded-lg border p-1 text-sm transition-colors",
                past && "cursor-not-allowed border-transparent bg-gray-50 text-gray-300",
                !past && !status && "border-gray-200 bg-white text-gray-900 hover:border-cyan-400 hover:bg-cyan-50",
                !past && status === "blocked" && "border-gray-300 bg-gray-200 text-gray-700 hover:border-gray-400",
                !past && status === "booked" && "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-400",
                !past && status === "held" && "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-400",
                date === today && "font-bold"
              )}
            >
              <span>{Number(date.slice(8))}</span>
              {label && !past && <span className="line-clamp-2 w-full text-center text-[10px] leading-tight font-medium break-words">{label}</span>}
            </button>
          );
        })}
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
        <li>
          <span className="mr-1 inline-block size-2.5 rounded-sm bg-emerald-100 ring-1 ring-emerald-300" />
          Booked
        </li>
        <li>
          <span className="mr-1 inline-block size-2.5 rounded-sm bg-gray-200 ring-1 ring-gray-300" />
          Blocked
        </li>
        <li>
          <span className="mr-1 inline-block size-2.5 rounded-sm bg-amber-100 ring-1 ring-amber-300" />
          Held for a couple
        </li>
      </ul>
      <p className="mt-2 text-xs text-gray-500">Click a day to add an event, or to see an event&apos;s details.</p>

      {openDate && (
        <DayDialog
          key={openDate}
          date={openDate}
          mine={manualBy.get(openDate)}
          hold={heldBy.get(openDate)}
          couple={coupleBy.get(openDate)}
          onClose={() => setOpenDate(null)}
        />
      )}
    </section>
  );
}

function DayDialog({
  date,
  mine,
  hold,
  couple,
  onClose,
}: {
  date: string;
  mine: Manual | undefined;
  hold: Hold | undefined;
  couple: CoupleBooking | undefined;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const act = useAction();
  const [editing, setEditing] = useState(!mine && !hold && !couple); // empty day opens straight into the form
  const [title, setTitle] = useState(mine?.title ?? "");
  const [status, setStatus] = useState<"booked" | "blocked">(mine?.status ?? "booked");
  const [details, setDetails] = useState(mine?.details ?? "");
  const [through, setThrough] = useState("");

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const dates = mine ? [date] : span(date, through);
  const save = () =>
    act.run(() => setAvailabilityAction({ dates, status, title: title.trim(), details: details.trim() }), onClose);
  const remove = () => act.run(() => setAvailabilityAction({ dates: [date], status: "free" }), onClose);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="day-title"
      className="m-auto w-full max-w-md rounded-2xl p-0 shadow-xl backdrop:bg-gray-900/40"
    >
      <div className="space-y-4 p-6">
        <div>
          <p className="text-xs font-medium text-gray-500">{longDate(date)}</p>
          <h2 id="day-title" className="text-lg font-semibold">
            {editing ? (mine ? "Edit event" : "Add event") : (couple?.label ?? mine?.title ?? (hold ? "Held for a couple" : mine?.status === "blocked" ? "Blocked" : "Booked"))}
          </h2>
        </div>

        {editing ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-700">Event name</span>
              <input
                className={fieldClasses}
                maxLength={80}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Priya & Sam, or Family trip"
                autoFocus
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-700">Type</span>
              <select className={fieldClasses} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="booked">Booked (a job)</option>
                <option value="blocked">Blocked (unavailable)</option>
              </select>
            </label>
            {!mine && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">Through (optional, for several days)</span>
                <input type="date" className={fieldClasses} value={through} min={date} onChange={(e) => setThrough(e.target.value)} />
                {dates.length > 1 && <span className="mt-1 block text-xs text-gray-500">Covers {dates.length} days.</span>}
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-700">Details</span>
              <textarea
                className={fieldClasses}
                rows={4}
                maxLength={2000}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Venue, timeline, package, contact, anything you need to remember."
              />
            </label>
            {act.error && (
              <p role="alert" className="text-sm text-red-600">
                {act.error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" color="cyan" disabled={act.pending}>
                {act.pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-3 text-sm">
            {mine && (
              <>
                <span
                  className={clsx(
                    "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                    mine.status === "booked" ? "bg-emerald-50 text-emerald-800" : "bg-gray-200 text-gray-700"
                  )}
                >
                  {mine.status === "booked" ? "Booked" : "Blocked"}
                </span>
                {mine.details ? (
                  <p className="whitespace-pre-wrap text-gray-800">{mine.details}</p>
                ) : (
                  <p className="text-gray-500">No details added.</p>
                )}
              </>
            )}
            {couple && (
              <p className="text-gray-700">
                Booked through a Knotly conversation{couple.label ? ` with ${couple.label}` : ""}. Open the conversation in
                Needs You or Messages for the details.
              </p>
            )}
            {hold && (
              <p className="text-gray-700">
                Your agent is holding this date for a couple
                {hold.expires ? ` until ${new Date(hold.expires).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}.
              </p>
            )}
            {act.error && (
              <p role="alert" className="text-sm text-red-600">
                {act.error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              {mine && (
                <>
                  <Button type="button" variant="outline" disabled={act.pending} onClick={remove}>
                    Remove
                  </Button>
                  <Button type="button" color="cyan" onClick={() => setEditing(true)}>
                    Edit
                  </Button>
                </>
              )}
              {!mine && (
                <Button type="button" variant="outline" onClick={onClose}>
                  Close
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
