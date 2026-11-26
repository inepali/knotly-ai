// src/components/dashboard/AvailabilityCalendar.tsx — a month calendar for blocking and booking
// dates. Click days to select them, then Block, Mark booked or Free up. Past days are locked.
"use client";
import { useState, useSyncExternalStore } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { panelClasses } from "@/components/ui/fields";
import { setAvailabilityAction } from "@/app/vendor/dashboard/actions";
import { useAction } from "./useAction";

export type Manual = { date: string; status: "blocked" | "booked" };
export type Hold = { date: string; expires: string | null };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const localToday = () => {
  const n = new Date();
  return iso(n.getFullYear(), n.getMonth(), n.getDate());
};
const noopSubscribe = () => () => {};

export default function AvailabilityCalendar({
  serverToday,
  manual,
  holds,
  coupleBooked,
}: {
  serverToday: string;
  manual: Manual[];
  holds: Hold[];
  coupleBooked: string[]; // dates booked through a conversation: shown, but not editable here
}) {
  // The vendor's own "today" (their browser), without a hydration mismatch.
  const today = useSyncExternalStore(noopSubscribe, localToday, () => serverToday);
  const act = useAction();
  const [month, setMonth] = useState<{ y: number; m: number } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const [ty, tm] = today.split("-").map(Number);
  const view = month ?? { y: ty, m: tm - 1 };
  const canGoBack = view.y > ty || (view.y === ty && view.m > tm - 1);

  const manualBy = new Map(manual.map((r) => [r.date, r.status]));
  const heldBy = new Map(holds.map((h) => [h.date, h]));
  const couple = new Set(coupleBooked);

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
  const toggle = (date: string) => setSelected((s) => (s.includes(date) ? s.filter((x) => x !== date) : [...s, date].sort()));
  const apply = (status: "blocked" | "booked" | "free") =>
    act.run(() => setAvailabilityAction({ dates: selected, status }), () => setSelected([]));
  const anyMarked = selected.some((d) => manualBy.has(d));

  return (
    <section className={`${panelClasses} p-6`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">
          {first.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </h2>
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
          const hold = heldBy.get(date);
          const status = couple.has(date) ? "booked" : (manualBy.get(date) ?? (hold ? "held" : null));
          const locked = past || couple.has(date) || !!hold;
          const on = selected.includes(date);
          return (
            <button
              key={date}
              type="button"
              disabled={locked}
              aria-pressed={on}
              aria-label={`${date}${status ? `, ${status}` : ""}${past ? ", past" : ""}`}
              onClick={() => toggle(date)}
              className={clsx(
                "flex aspect-square min-h-14 flex-col items-center justify-center rounded-lg border text-sm transition-colors",
                past && "cursor-not-allowed border-transparent bg-gray-50 text-gray-300",
                !past && !status && "border-gray-200 bg-white text-gray-900 hover:border-cyan-400 hover:bg-cyan-50",
                !past && status === "blocked" && "border-gray-300 bg-gray-200 text-gray-700",
                !past && status === "booked" && "border-emerald-200 bg-emerald-50 text-emerald-800",
                !past && status === "held" && "cursor-not-allowed border-amber-200 bg-amber-50 text-amber-800",
                locked && !past && "cursor-not-allowed",
                on && "ring-2 ring-cyan-500",
                date === today && "font-bold"
              )}
            >
              <span>{Number(date.slice(8))}</span>
              {status && !past && (
                <span className="text-[10px] leading-tight font-medium capitalize">
                  {couple.has(date) ? "Knotly" : status}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
        <li>
          <span className="mr-1 inline-block size-2.5 rounded-sm bg-gray-200 ring-1 ring-gray-300" />
          Blocked
        </li>
        <li>
          <span className="mr-1 inline-block size-2.5 rounded-sm bg-emerald-100 ring-1 ring-emerald-300" />
          Booked
        </li>
        <li>
          <span className="mr-1 inline-block size-2.5 rounded-sm bg-amber-100 ring-1 ring-amber-300" />
          Held for a couple
        </li>
      </ul>

      {selected.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 p-3" role="group" aria-label="Selected dates">
          <p className="mr-2 text-sm text-gray-700">
            {selected.length} day{selected.length === 1 ? "" : "s"} selected
          </p>
          <Button type="button" color="gray" disabled={act.pending} onClick={() => apply("blocked")}>
            Block
          </Button>
          <Button type="button" color="cyan" disabled={act.pending} onClick={() => apply("booked")}>
            Mark booked
          </Button>
          {anyMarked && (
            <Button type="button" variant="outline" disabled={act.pending} onClick={() => apply("free")}>
              Free up
            </Button>
          )}
          <button type="button" className="text-sm text-gray-500 underline" onClick={() => setSelected([])}>
            Clear
          </button>
        </div>
      ) : (
        <p className="mt-4 text-xs text-gray-500">
          Click a day to select it, then block it or mark it booked. Days that are already blocked or booked can be selected
          to free them up.
        </p>
      )}
      {act.error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {act.error}
        </p>
      )}
    </section>
  );
}
