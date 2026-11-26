// src/components/seating/SeatingBoard.tsx — drag people onto tables (or tap a person, then a table).
"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { fieldClasses, panelClasses } from "@/components/ui/fields";
import { useAction } from "@/components/dashboard/useAction";
import { addTablesAction, deleteTableAction, saveTableAction, setSeatsAction } from "@/app/client/dashboard/actions";
import { autoSeat, escortCsv, plan, type Seatable, type SeatingTable } from "@/lib/seating";
import type { loadSeating } from "@/lib/actions/seating";

type Data = Extract<Awaited<ReturnType<typeof loadSeating>>, { ok: true }>["data"];
const seatOf = (s: Seatable, table_id: string | null) => ({ household_id: s.household_id, guest_id: s.guest_id, plus_index: s.plus_index, table_id });

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

export default function SeatingBoard({ data }: { data: Data }) {
  const act = useAction();
  const [picked, setPicked] = useState<string[]>([]); // seat keys selected for tap-to-move
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const p = useMemo(() => plan(data.tables, data.people, data.assignments), [data]);
  const byKey = useMemo(() => new Map(data.people.map((s) => [s.key, s])), [data.people]);
  const seated = data.people.length - p.unseated.length;

  const move = (keys: string[], tableId: string | null) => {
    const seats = keys.map((k) => byKey.get(k)).filter((s): s is Seatable => !!s).map((s) => seatOf(s, tableId));
    if (seats.length) act.run(() => setSeatsAction({ seats }), () => setPicked([]));
  };
  const dragProps = (s: Seatable) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      // Dragging one person of a household drags the whole household with Shift held.
      const keys = e.shiftKey ? data.people.filter((x) => x.household_id === s.household_id).map((x) => x.key) : picked.includes(s.key) ? picked : [s.key];
      e.dataTransfer.setData("text/plain", JSON.stringify(keys));
    },
    onClick: () => setPicked((ks) => (ks.includes(s.key) ? ks.filter((k) => k !== s.key) : [...ks, s.key])),
  });
  const dropProps = (tableId: string | null) => ({
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      try {
        move(JSON.parse(e.dataTransfer.getData("text/plain")) as string[], tableId);
      } catch {
        // not one of our drags
      }
    },
  });
  const chip = (s: Seatable) => (
    <button
      key={s.key}
      type="button"
      {...dragProps(s)}
      aria-pressed={picked.includes(s.key)}
      className={clsx("rounded-full border px-2.5 py-1 text-xs", picked.includes(s.key) ? "border-cyan-500 bg-cyan-50" : "border-gray-200 bg-white", s.plus_index !== null && "italic")}
      title={s.household}
    >
      {s.name}
      {s.is_child && " (child)"}
    </button>
  );
  const unseated = p.unseated.filter((s) => !q.trim() || `${s.name} ${s.household}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="mt-6 space-y-6">
      {data.people.length === 0 && (
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
          Add guests on your <Link href="/client/dashboard/guests" className="underline">Guest List</Link> first.
        </p>
      )}

      <section className={`${panelClasses} flex flex-wrap items-center justify-between gap-3 p-5 text-sm`}>
        <p>
          <strong>{seated}</strong> of {data.people.length} seated · {data.tables.length} tables ·{" "}
          {data.tables.reduce((s, t) => s + t.capacity, 0)} seats
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            color="gray"
            disabled={act.pending || !p.unseated.length || !data.tables.length}
            onClick={() => {
              const seats = autoSeat(data.tables, p);
              if (!seats.length) return act.run(async () => ({ ok: false, error: "No table has room for the households left. Add tables or seats." }));
              act.run(() => setSeatsAction({ seats: seats.map((a) => ({ ...a })) }), undefined, `Seated ${seats.length} people.`);
            }}
          >
            Seat households together
          </Button>
          <Button type="button" variant="outline" color="gray" disabled={!seated} onClick={() => download("escort-cards.csv", escortCsv(data.tables, p))}>
            Escort list CSV
          </Button>
          <Button variant="outline" color="gray" href="/client/print/seating" target="_blank">
            Print
          </Button>
        </div>
      </section>

      {p.warnings.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {p.warnings.map((w, i) => <li key={i}>⚠ {w.text}</li>)}
        </ul>
      )}
      {(act.error || act.notice) && <p role={act.error ? "alert" : "status"} className={clsx("text-sm", act.error ? "text-red-600" : "text-emerald-700")}>{act.error || act.notice}</p>}

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <section {...dropProps(null)} className={`${panelClasses} h-fit space-y-3 p-4 lg:sticky lg:top-4`}>
          <h2 className="text-base font-semibold">Not seated ({p.unseated.length})</h2>
          <input type="search" aria-label="Search" placeholder="Search…" className={fieldClasses} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex max-h-[60vh] flex-wrap gap-1.5 overflow-y-auto">{unseated.map(chip)}</div>
          <p className="text-xs text-gray-500">
            Drag a person to a table (hold Shift to drag their whole household), or tap people, then tap a table&apos;s &quot;Seat here&quot;.
          </p>
          {picked.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span>{picked.length} selected</span>
              <button type="button" className="text-cyan-700 underline" onClick={() => move(picked, null)}>Unseat</button>
              <button type="button" className="underline" onClick={() => setPicked([])}>Clear</button>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <AddTables count={data.tables.length} />
          <ul className="grid gap-4 sm:grid-cols-2">
            {data.tables.map((t) => {
              const ps = p.byTable.get(t.id) ?? [];
              const over = ps.length > t.capacity;
              return (
                <li key={t.id} {...dropProps(t.id)} className={clsx(panelClasses, "space-y-2 p-4", over && "ring-2 ring-amber-400")}>
                  {editing === t.id ? (
                    <TableForm table={t} onDone={() => setEditing(null)} />
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">
                        {t.shape === "round" ? "◯" : "▭"} {t.name}
                        <span className={clsx("ml-2 text-xs font-normal", over ? "text-amber-700" : "text-gray-500")}>{ps.length}/{t.capacity}</span>
                      </p>
                      <div className="flex gap-2 text-xs">
                        {picked.length > 0 && <button type="button" className="font-semibold text-cyan-700 underline" onClick={() => move(picked, t.id)}>Seat here</button>}
                        <button type="button" className="text-cyan-700 underline" onClick={() => setEditing(t.id)}>Edit</button>
                        <button type="button" className="text-red-600 underline" onClick={() => confirm(`Remove ${t.name}? Its guests go back to Not seated.`) && act.run(() => deleteTableAction({ id: t.id }))}>Remove</button>
                      </div>
                    </div>
                  )}
                  <div className="flex min-h-10 flex-wrap gap-1.5 rounded-lg bg-gray-50 p-2">{ps.length ? ps.map(chip) : <span className="text-xs text-gray-400">Drop guests here</span>}</div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

function AddTables({ count }: { count: number }) {
  const add = useAction();
  const [n, setN] = useState(count ? 1 : 10);
  const [cap, setCap] = useState(8);
  const [shape, setShape] = useState<"round" | "long">("round");
  return (
    <form
      className={`${panelClasses} flex flex-wrap items-end gap-2 p-4 text-sm`}
      onSubmit={(e) => {
        e.preventDefault();
        add.run(() => addTablesAction({ count: n, capacity: cap, shape }));
      }}
    >
      <label className="text-xs text-gray-600">Add<input type="number" min={1} max={50} className={`${fieldClasses} mt-1 w-20`} value={n} onChange={(e) => setN(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} /></label>
      <label className="text-xs text-gray-600">
        Shape
        <select className={`${fieldClasses} mt-1 w-28`} value={shape} onChange={(e) => setShape(e.target.value as "round" | "long")}>
          <option value="round">Round</option>
          <option value="long">Long</option>
        </select>
      </label>
      <label className="text-xs text-gray-600">Seats each<input type="number" min={1} max={40} className={`${fieldClasses} mt-1 w-20`} value={cap} onChange={(e) => setCap(Math.max(1, Math.min(40, Number(e.target.value) || 1)))} /></label>
      <Button type="submit" color="cyan" disabled={add.pending}>Add table{n === 1 ? "" : "s"}</Button>
      {add.error && <p role="alert" className="w-full text-red-600">{add.error}</p>}
    </form>
  );
}

function TableForm({ table, onDone }: { table: SeatingTable; onDone: () => void }) {
  const save = useAction();
  const [name, setName] = useState(table.name);
  const [cap, setCap] = useState(table.capacity);
  const [shape, setShape] = useState(table.shape);
  return (
    <form
      className="flex flex-wrap items-end gap-2 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        save.run(() => saveTableAction({ id: table.id, name, capacity: cap, shape }), onDone);
      }}
    >
      <input aria-label="Table name" className={`${fieldClasses} w-36`} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
      <select aria-label="Shape" className={`${fieldClasses} w-24`} value={shape} onChange={(e) => setShape(e.target.value as "round" | "long")}>
        <option value="round">Round</option>
        <option value="long">Long</option>
      </select>
      <input aria-label="Seats" type="number" min={1} max={40} className={`${fieldClasses} w-20`} value={cap} onChange={(e) => setCap(Math.max(1, Math.min(40, Number(e.target.value) || 1)))} />
      <Button type="submit" color="cyan" disabled={save.pending}>Save</Button>
      <button type="button" className="text-gray-600" onClick={onDone}>Cancel</button>
      {save.error && <p role="alert" className="w-full text-red-600">{save.error}</p>}
    </form>
  );
}
