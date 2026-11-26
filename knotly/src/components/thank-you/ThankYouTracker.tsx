// src/components/thank-you/ThankYouTracker.tsx — the gift log: add/edit gifts, tick thank-yous,
// pull in registry gifts, export, labels.
"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { fieldClasses, panelClasses } from "@/components/ui/fields";
import { useAction } from "@/components/dashboard/useAction";
import { deleteGiftAction, importGiftsAction, markThankedAction, saveGiftAction } from "@/app/client/dashboard/actions";
import { giftCounts, giftsCsv, type Gift } from "@/lib/thank-you";
import { parseUsd, usd } from "@/lib/registry";
import type { loadThankYou } from "@/lib/actions/thank-you";

type Data = Extract<Awaited<ReturnType<typeof loadThankYou>>, { ok: true }>["data"];
const SOURCE: Record<Gift["source"], string> = { manual: "", registry_claim: "Registry", gift_note: "Gift note" };

export default function ThankYouTracker({ data }: { data: Data }) {
  const act = useAction();
  const pull = useAction();
  const [filter, setFilter] = useState<"waiting" | "all" | "unmatched">("waiting");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const counts = giftCounts(data.gifts);
  const name = useMemo(() => new Map(data.households.map((h) => [h.id, h.label])), [data.households]);
  const shown = data.gifts.filter((g) => (filter === "all" ? true : filter === "waiting" ? !g.thanked_on : !g.household_id));
  const from = (g: Gift) => (g.household_id ? name.get(g.household_id) : null) ?? g.giver ?? "Unknown";

  return (
    <div className="mt-6 space-y-6">
      <section className={`${panelClasses} flex flex-wrap items-center justify-between gap-3 p-5 text-sm`}>
        <p>
          <strong>{counts.thanked}</strong> of {counts.total} thanked{counts.waiting ? ` · ${counts.waiting} to go` : counts.total ? " · all done 🎉" : ""}
          {counts.unmatched > 0 && ` · ${counts.unmatched} not linked to a household`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" color="cyan" onClick={() => setEditing("new")}>Add gift</Button>
          {data.hasRegistry && (
            <Button
              type="button"
              variant="outline"
              color="gray"
              disabled={pull.pending}
              onClick={() =>
                pull.run(async () => {
                  const r = await importGiftsAction();
                  return r.ok && r.added === 0 ? { ok: false, error: "Nothing new from your registry." } : r;
                }, undefined, "Added new gifts from your registry.")
              }
            >
              Pull in from registry
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            color="gray"
            disabled={!data.gifts.length}
            onClick={() => {
              const url = URL.createObjectURL(new Blob([giftsCsv(data.gifts, data.households)], { type: "text/csv;charset=utf-8" }));
              Object.assign(document.createElement("a"), { href: url, download: "gifts.csv" }).click();
              URL.revokeObjectURL(url);
            }}
          >
            Export CSV
          </Button>
          <Button variant="outline" color="gray" href="/client/print/labels" target="_blank">Address labels</Button>
        </div>
        {(pull.error || pull.notice) && <p className={clsx("w-full text-sm", pull.error ? "text-gray-600" : "text-emerald-700")}>{pull.error || pull.notice}</p>}
      </section>

      {editing === "new" && <GiftForm households={data.households} onDone={() => setEditing(null)} />}

      <section className={`${panelClasses} space-y-3 p-4 sm:p-6`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <select aria-label="Show" className={`${fieldClasses} w-56`} value={filter} onChange={(e) => {
              setFilter(e.target.value as typeof filter);
              setSel([]);
            }}>
            <option value="waiting">Needs a thank-you ({counts.waiting})</option>
            <option value="all">All gifts ({counts.total})</option>
            <option value="unmatched">Not linked to a household ({counts.unmatched})</option>
          </select>
          {sel.length > 0 && (
            <div className="flex gap-3 text-sm">
              <span className="text-gray-500">{sel.length} selected</span>
              <button type="button" className="font-semibold text-emerald-700 underline" onClick={() => act.run(() => markThankedAction({ ids: sel, thanked: true }), () => setSel([]))}>Mark thanked</button>
              <button type="button" className="underline" onClick={() => act.run(() => markThankedAction({ ids: sel, thanked: false }), () => setSel([]))}>Mark not thanked</button>
            </div>
          )}
        </div>
        {act.error && <p role="alert" className="text-sm text-red-600">{act.error}</p>}
        {shown.length === 0 ? (
          <p className="text-sm text-gray-500">{data.gifts.length ? "Nothing here." : "No gifts yet. Add one, or pull them in from your registry."}</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {shown.map((g) =>
              editing === g.id ? (
                <li key={g.id} className="py-3"><GiftForm households={data.households} initial={g} onDone={() => setEditing(null)} /></li>
              ) : (
                <li key={g.id} className="flex flex-wrap items-start gap-3 py-3">
                  <input type="checkbox" aria-label={`Select gift from ${from(g)}`} className="mt-1" checked={sel.includes(g.id)} onChange={() => setSel((s) => (s.includes(g.id) ? s.filter((x) => x !== g.id) : [...s, g.id]))} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {from(g)}
                      {!g.household_id && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-normal text-amber-800">not linked</span>}
                      {SOURCE[g.source] && <span className="ml-2 text-xs font-normal text-gray-500">{SOURCE[g.source]}</span>}
                    </p>
                    <p className="text-gray-700">{g.description}{g.amount_cents != null ? ` · ${usd(g.amount_cents)}` : ""}</p>
                    {g.notes && <p className="text-xs text-gray-500">“{g.notes}”</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    {g.thanked_on ? (
                      <button type="button" className="text-emerald-700" title="Mark not thanked" onClick={() => act.run(() => markThankedAction({ ids: [g.id], thanked: false }))}>✓ Thanked {g.thanked_on}</button>
                    ) : (
                      <Button type="button" variant="outline" color="gray" onClick={() => act.run(() => markThankedAction({ ids: [g.id], thanked: true }))}>Thanked</Button>
                    )}
                    <button type="button" className="text-cyan-700 underline" onClick={() => setEditing(g.id)}>Edit</button>
                    <button type="button" className="text-red-600 underline" onClick={() => confirm("Remove this gift?") && act.run(() => deleteGiftAction({ id: g.id }))}>Remove</button>
                  </div>
                </li>
              )
            )}
          </ul>
        )}
        {data.households.length === 0 && (
          <p className="text-xs text-gray-500">Add households (with addresses) on your <Link href="/client/dashboard/guests" className="underline">Guest List</Link> to link gifts and print labels.</p>
        )}
      </section>
    </div>
  );
}

function GiftForm({ households, initial, onDone }: { households: Data["households"]; initial?: Gift; onDone: () => void }) {
  const save = useAction();
  const [householdId, setHouseholdId] = useState(initial?.household_id ?? "");
  const [giver, setGiver] = useState(initial?.giver ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [amount, setAmount] = useState(initial?.amount_cents != null ? String(initial.amount_cents / 100) : "");
  const [received, setReceived] = useState(initial?.received_on ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const cents = parseUsd(amount);
  return (
    <form
      className={`${panelClasses} grid gap-2 p-4 text-sm sm:grid-cols-2`}
      onSubmit={(e) => {
        e.preventDefault();
        save.run(
          () =>
            saveGiftAction({
              id: initial?.id,
              household_id: householdId || null,
              giver: householdId ? null : giver,
              description,
              amount_cents: cents ?? null,
              received_on: received,
              thanked_on: initial?.thanked_on ?? null,
              notes,
            }),
          onDone
        );
      }}
    >
      <label className="text-xs text-gray-600">
        From (household)
        <select className={`${fieldClasses} mt-1`} value={householdId} onChange={(e) => setHouseholdId(e.target.value)}>
          <option value="">Someone not on the list…</option>
          {households.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
        </select>
      </label>
      {!householdId && (
        <label className="text-xs text-gray-600">
          Their name
          <input className={`${fieldClasses} mt-1`} maxLength={80} value={giver} onChange={(e) => setGiver(e.target.value)} />
        </label>
      )}
      <label className="text-xs text-gray-600 sm:col-span-2">
        Gift
        <input className={`${fieldClasses} mt-1`} maxLength={200} placeholder="Stand mixer, card with $100…" value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="text-xs text-gray-600">Amount (optional)<input inputMode="decimal" className={`${fieldClasses} mt-1`} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <label className="text-xs text-gray-600">Received<input type="date" className={`${fieldClasses} mt-1`} value={received} onChange={(e) => setReceived(e.target.value)} /></label>
      <label className="text-xs text-gray-600 sm:col-span-2">Notes<input className={`${fieldClasses} mt-1`} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" color="cyan" disabled={save.pending || !description.trim() || cents === undefined || (!householdId && !giver.trim())}>Save gift</Button>
        <button type="button" className="text-gray-600" onClick={onDone}>Cancel</button>
        {cents === undefined && <span className="text-xs text-red-600">Enter the amount as a number.</span>}
        {save.error && <span role="alert" className="text-red-600">{save.error}</span>}
      </div>
    </form>
  );
}
