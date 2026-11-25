// src/components/dashboard/BudgetEditor.tsx — the Budget page: totals, one row per category
// with its target / booking, and forms to add or change them.
"use client";
import { useEffect, useRef, useState, useTransition } from "react";
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
  const [adding, setAdding] = useState(false); // "Add budget" modal

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

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Budget by vendor type</h2>
        <Button type="button" color="cyan" disabled={pending} onClick={() => setAdding(true)}>
          Add budget
        </Button>
      </div>

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

      <AddBudgetModal
        open={adding}
        existing={lines.map((l) => ({ category: l.category, label: l.label }))}
        disabled={pending}
        error={error}
        onClose={() => {
          setAdding(false);
          setError("");
        }}
        onAdd={(category, label, amount) =>
          run(
            () =>
              planBudgetAction({
                allocations: [{ category, label: category === "other" ? label || "Other" : undefined, amount }],
                fromCouple: true,
              } as never),
            () => setAdding(false)
          )
        }
      />
      {error && !adding && (
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

function AddBudgetModal({
  open,
  existing,
  disabled,
  error,
  onClose,
  onAdd,
}: {
  open: boolean;
  existing: { category: string; label: string | null }[];
  disabled: boolean;
  error: string;
  onClose: () => void;
  onAdd: (category: string, label: string, amount: number) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [category, setCategory] = useState("photographer");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setAmount("");
      setLabel("");
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);

  // A vendor type already in the list can't be added twice (edit its target instead).
  const name = category === "other" ? label.trim() : categoryLabel(category);
  const duplicate = existing.some((l) =>
    category === "other"
      ? l.category === "other" && (l.label ?? "").toLowerCase() === label.trim().toLowerCase() && label.trim() !== ""
      : l.category === category
  );
  const valid = whole(amount) != null && (category !== "other" || label.trim() !== "") && !duplicate;
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="add-budget-title"
      className="m-auto w-full max-w-md rounded-2xl p-0 shadow-xl backdrop:bg-gray-900/40"
    >
      <form
        className="space-y-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onAdd(category, label.trim(), whole(amount)!);
        }}
      >
        <h2 id="add-budget-title" className="text-lg font-semibold">
          Add budget
        </h2>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-700">Vendor type</span>
          <select className={fieldClasses} value={category} onChange={(e) => setCategory(e.target.value)}>
            {VENDOR_CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
            <option value="other">Other…</option>
          </select>
        </label>
        {category === "other" && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-700">Name</span>
            <input className={fieldClasses} placeholder="e.g. Rings" maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-700">Estimated budget (USD)</span>
          <input
            inputMode="numeric"
            className={fieldClasses}
            placeholder="1500"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
            autoFocus
          />
        </label>
        {duplicate && (
          <p role="alert" className="text-sm text-amber-700">
            {name} is already in your budget list. Use &ldquo;Change target&rdquo; on that row to update it.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" color="cyan" disabled={disabled || !valid}>
            Add
          </Button>
        </div>
      </form>
    </dialog>
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
