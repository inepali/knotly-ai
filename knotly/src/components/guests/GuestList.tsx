// src/components/guests/GuestList.tsx — the Guest List page: totals, search, households, events, import/export.
"use client";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { fieldClasses, panelClasses } from "@/components/ui/fields";
import { useAction } from "@/components/dashboard/useAction";
import { applyGuestCountAction, deleteHouseholdAction } from "@/app/client/dashboard/actions";
import { exportCsv, guestTotals, matchesSearch, sideNames, type Household, type Side, type WeddingEvent } from "@/lib/guests";
import HouseholdForm from "./HouseholdForm";
import ImportGuests from "./ImportGuests";
import EventsEditor from "./EventsEditor";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

export default function GuestList({
  households,
  events,
  partnerNames,
  guestCount,
}: {
  households: Household[];
  events: WeddingEvent[];
  partnerNames: string | null;
  guestCount: number | null;
}) {
  const names = sideNames(partnerNames);
  const [q, setQ] = useState("");
  const [side, setSide] = useState<Side | "">("");
  const [tag, setTag] = useState("");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [panel, setPanel] = useState<"import" | "events" | null>(null);
  const count = useAction();
  const del = useAction();

  const totals = useMemo(() => guestTotals(households), [households]);
  const allTags = useMemo(() => [...new Set(households.flatMap((h) => h.tags))].sort(), [households]);
  const shown = households.filter((h) => matchesSearch(h, q) && (!side || h.side === side) && (!tag || h.tags.includes(tag)));
  const eventName = (id: string) => events.find((e) => e.id === id)?.name ?? "";

  return (
    <div className="mt-6 space-y-6">
      <section className={`${panelClasses} p-6`}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Invited" value={totals.invited} hint={totals.plusOnes ? `incl. ${totals.plusOnes} plus-ones` : undefined} />
          <Stat label="Households" value={totals.households} />
          <Stat label="Adults" value={totals.adults} />
          <Stat label="Kids" value={totals.kids} />
        </div>
        <p className="mt-3 text-sm text-gray-600">
          {names.a}: {totals.bySide.a} · {names.b}: {totals.bySide.b} · Both: {totals.bySide.both}
          {events.map((e) => ` · ${e.name}: ${totals.byEvent[e.id] ?? 0}`).join("")}
        </p>
        {totals.invited > 0 && totals.invited !== guestCount && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-gray-600">
              My Wedding says {guestCount ?? "no"} guests. Vendors use that number for estimates.
            </span>
            <Button
              type="button"
              variant="outline"
              color="gray"
              disabled={count.pending}
              onClick={() => count.run(() => applyGuestCountAction(), undefined, `Guest count set to ${totals.invited}.`)}
            >
              Use {totals.invited} as my guest count
            </Button>
          </div>
        )}
        {(count.error || count.notice) && (
          <p role={count.error ? "alert" : "status"} className={clsx("mt-2 text-sm", count.error ? "text-red-600" : "text-emerald-700")}>
            {count.error || count.notice}
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" color="cyan" onClick={() => setEditing("new")}>
          Add household
        </Button>
        <Button type="button" variant="outline" color="gray" onClick={() => setPanel(panel === "import" ? null : "import")}>
          Import CSV
        </Button>
        <Button
          type="button"
          variant="outline"
          color="gray"
          disabled={!households.length}
          onClick={() => download("guest-list.csv", exportCsv(households, partnerNames))}
        >
          Export CSV
        </Button>
        <Button type="button" variant="outline" color="gray" onClick={() => setPanel(panel === "events" ? null : "events")}>
          Events ({events.length})
        </Button>
      </div>

      {panel === "import" && <ImportGuests partnerNames={partnerNames} onDone={() => setPanel(null)} />}
      {panel === "events" && <EventsEditor events={events} />}
      {editing === "new" && (
        <HouseholdForm events={events} names={names} onDone={() => setEditing(null)} />
      )}

      <section className={`${panelClasses} p-4 sm:p-6`}>
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            aria-label="Search guests"
            placeholder="Search names, tags, city…"
            className={`${fieldClasses} max-w-xs`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select aria-label="Side" className={`${fieldClasses} w-40`} value={side} onChange={(e) => setSide(e.target.value as Side | "")}>
            <option value="">Everyone</option>
            <option value="a">{names.a}</option>
            <option value="b">{names.b}</option>
            <option value="both">Both</option>
          </select>
          {allTags.length > 0 && (
            <select aria-label="Tag" className={`${fieldClasses} w-40`} value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">All tags</option>
              {allTags.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          )}
        </div>

        {households.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No guests yet. Add a household or import a CSV.</p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-100">
            {shown.map((h) =>
              editing === h.id ? (
                <li key={h.id} className="py-3">
                  <HouseholdForm initial={h} events={events} names={names} onDone={() => setEditing(null)} />
                </li>
              ) : (
                <li key={h.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {h.label}
                      <span className="ml-2 text-xs font-normal text-gray-500">
                        {h.side === "both" ? "Both" : names[h.side]}
                        {h.plus_ones ? ` · +${h.plus_ones}` : ""}
                      </span>
                    </p>
                    <p className="text-gray-700">
                      {h.guests.map((g) => `${g.first_name} ${g.last_name}`.trim() + (g.is_child ? " (child)" : "")).join(", ")}
                    </p>
                    <p className="text-xs text-gray-500">
                      {[...h.tags, ...h.event_ids.map(eventName), h.address.city].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button type="button" className="text-cyan-700 underline" onClick={() => setEditing(h.id!)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-red-600 underline disabled:opacity-50"
                      disabled={del.pending}
                      onClick={() => confirm(`Remove ${h.label}?`) && del.run(() => deleteHouseholdAction({ id: h.id! }))}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              )
            )}
            {shown.length === 0 && <li className="py-3 text-sm text-gray-500">No matches.</li>}
          </ul>
        )}
        {del.error && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {del.error}
          </p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value.toLocaleString("en-US")}</p>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
