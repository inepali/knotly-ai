// src/components/dashboard/BudgetEditor.tsx — the Budget page: totals, one row per category
// with its target / booking, and forms to add or change them.
"use client";
import { useState, useTransition } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { fieldClasses, panelClasses } from "@/components/ui/fields";
import { VENDOR_CATEGORIES, categoryLabel } from "@/lib/categories";
import type { Budget, BudgetLine } from "@/lib/budget";
import { planBudgetAction, recordBookingAction, suggestBudgetAction } from "@/app/client/dashboard/actions";

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
const lineName = (l: BudgetLine) => l.label ?? categoryLabel(l.category);
const whole = (s: string) => (s.trim() !== "" && Number.isFinite(Number(s)) ? Math.round(Number(s)) : null);

const BASIS: Record<NonNullable<BudgetLine["basis"]>, { label: string; className: string }> = {
  booked: { label: "Booked", className: "bg-emerald-50 text-emerald-800" },
  quote: { label: "Estimate", className: "bg-cyan-50 text-cyan-800" },
  planned: { label: "Planned", className: "bg-gray-100 text-gray-600" },
};

export default function BudgetEditor({ budget }: { budget: Budget | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [booking, setBooking] = useState<string | null>(null); // line key being marked booked

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError("");
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      else after?.();
    });
  };

  if (!budget)
    return (
      <p className={`${panelClasses} mt-6 p-6 text-sm text-gray-600`}>
        Save your wedding details on the My Wedding page first, then come back to plan your budget.
      </p>
    );

  const { budgetTotal, totals, lines } = budget;
  const over = totals.remaining != null && totals.remaining < 0;
  const pct = Math.min(100, totals.percentUsed ?? 0);

  return (
    <div className="mt-6 space-y-6 text-sm">
      <section className={`${panelClasses} p-6`}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Total budget" value={budgetTotal != null ? usd(budgetTotal) : "Not set"} />
          <Stat label="Current estimate" value={usd(totals.current)} />
          <Stat label="Booked" value={usd(totals.booked)} />
          <Stat
            label={over ? "Over budget" : "Remaining"}
            value={totals.remaining != null ? usd(Math.abs(totals.remaining)) : "—"}
            tone={over ? "bad" : "good"}
          />
        </div>
        {budgetTotal != null && (
          <div className="mt-5">
            <div className="h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className={clsx("h-full rounded-full", over ? "bg-red-500" : "bg-cyan-500")} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-xs text-gray-500">{totals.percentUsed}% of your budget planned or committed.</p>
          </div>
        )}
        <div className="mt-5">
          <Button type="button" variant="outline" disabled={pending} onClick={() => run(suggestBudgetAction)}>
            Suggest a split
          </Button>
          <p className="mt-2 text-xs text-gray-500">
            Divides your total budget across the vendor types you need. It never changes a target you set yourself.
          </p>
        </div>
      </section>

      {lines.length > 0 && (
        <ul className="divide-y divide-gray-200 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-900/5">
          {lines.map((l) => {
            const key = `${l.category}|${l.label ?? ""}`;
            const overTarget = l.planned != null && l.current != null && l.current > l.planned;
            return (
              <li key={key} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-semibold text-gray-900">
                    {lineName(l)}
                    {l.basis && (
                      <span className={clsx("ml-2 rounded-full px-2 py-0.5 text-xs font-medium", BASIS[l.basis].className)}>
                        {BASIS[l.basis].label}
                      </span>
                    )}
                  </p>
                  <p className={clsx("font-semibold", overTarget ? "text-red-600" : "text-gray-900")}>
                    {l.current != null ? usd(l.current) : "—"}
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">
                  {l.planned != null ? `Target ${usd(l.planned)}${l.plannedBy === "ai" ? " (suggested)" : ""}` : "No target yet"}
                  {l.booked != null && ` · Booked ${usd(l.booked)}${l.bookedNote ? ` — ${l.bookedNote}` : ""}`}
                  {overTarget && " · over target"}
                </p>
                {l.quotes.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {l.quotes.map((q) => (
                      <li key={q.threadId + q.validUntil} className="flex justify-between gap-3 text-xs">
                        <span className="text-gray-700">Estimate from {q.vendor}</span>
                        <span className={q.total != null ? "text-gray-900" : "text-gray-500"}>
                          {q.total != null ? usd(q.total) : "Received, open it to see the price"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 flex gap-4 text-xs">
                  <TargetInline
                    line={l}
                    disabled={pending}
                    onSave={(amount) =>
                      run(() =>
                        planBudgetAction({
                          allocations: [{ category: l.category, label: l.label ?? undefined, amount }],
                          fromCouple: true,
                        } as never)
                      )
                    }
                  />
                  <button type="button" className="text-cyan-700 underline" onClick={() => setBooking(booking === key ? null : key)}>
                    {l.booked != null ? "Change booking" : "Mark booked"}
                  </button>
                </div>
                {booking === key && (
                  <BookForm
                    disabled={pending}
                    onCancel={() => setBooking(null)}
                    onSave={(amount, note) =>
                      run(
                        () =>
                          recordBookingAction({
                            category: l.category,
                            label: l.label ?? undefined,
                            amount,
                            note: note || undefined,
                          } as never),
                        () => setBooking(null)
                      )
                    }
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AddLine
        disabled={pending}
        onAdd={(category, label, amount) =>
          run(() =>
            planBudgetAction({
              allocations: [{ category, label: category === "other" ? label || "Other" : undefined, amount }],
              fromCouple: true,
            } as never)
          )
        }
      />
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

function TargetInline({ line, disabled, onSave }: { line: BudgetLine; disabled: boolean; onSave: (amount: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(line.planned?.toString() ?? "");
  if (!editing)
    return (
      <button type="button" className="text-cyan-700 underline" onClick={() => setEditing(true)}>
        {line.planned != null ? "Change target" : "Set target"}
      </button>
    );
  return (
    <span className="flex items-center gap-2">
      <input
        inputMode="numeric"
        aria-label={`${lineName(line)} target`}
        className={`${fieldClasses} w-28`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
      />
      <button
        type="button"
        className="text-cyan-700 underline disabled:opacity-50"
        disabled={disabled || whole(text) == null}
        onClick={() => {
          onSave(whole(text)!);
          setEditing(false);
        }}
      >
        Save
      </button>
    </span>
  );
}

function BookForm({ disabled, onSave, onCancel }: { disabled: boolean; onSave: (amount: number, note: string) => void; onCancel: () => void }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input inputMode="numeric" aria-label="Booked amount" placeholder="Amount" className={`${fieldClasses} w-28`} value={amount} onChange={(e) => setAmount(e.target.value)} />
      <input aria-label="Note" placeholder="Vendor / package (optional)" maxLength={200} className={`${fieldClasses} min-w-48 flex-1`} value={note} onChange={(e) => setNote(e.target.value)} />
      <Button type="button" color="cyan" disabled={disabled || whole(amount) == null} onClick={() => onSave(whole(amount)!, note.trim())}>
        Save
      </Button>
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

function AddLine({ disabled, onAdd }: { disabled: boolean; onAdd: (category: string, label: string, amount: number) => void }) {
  const [category, setCategory] = useState("photographer");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  return (
    <section className={`${panelClasses} p-4`}>
      <h2 className="text-sm font-semibold">Add a line</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select aria-label="Category" className={`${fieldClasses} w-56`} value={category} onChange={(e) => setCategory(e.target.value)}>
          {VENDOR_CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
          <option value="other">Other…</option>
        </select>
        {category === "other" && (
          <input aria-label="Name" placeholder="e.g. Rings" className={`${fieldClasses} w-40`} value={label} onChange={(e) => setLabel(e.target.value)} />
        )}
        <input inputMode="numeric" aria-label="Target amount" placeholder="Target (USD)" className={`${fieldClasses} w-36`} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Button
          type="button"
          color="cyan"
          disabled={disabled || whole(amount) == null}
          onClick={() => {
            onAdd(category, label.trim(), whole(amount)!);
            setAmount("");
            setLabel("");
          }}
        >
          Add
        </Button>
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={clsx("mt-1 text-xl font-semibold tracking-tight", tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-700" : "text-gray-900")}>
        {value}
      </p>
    </div>
  );
}
