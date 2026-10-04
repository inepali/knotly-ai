// src/components/budget/BudgetPane.tsx — the couple's Budget tab: target per category,
// vendor quotes as they arrive, bookings, and how the total compares to their budget.
"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { loadBudget, type Budget, type BudgetLine } from "@/lib/budget";
import { categoryLabel } from "@/lib/categories";

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
const name = (l: BudgetLine) => l.label ?? categoryLabel(l.category);

const BASIS: Record<NonNullable<BudgetLine["basis"]>, { label: string; className: string }> = {
  booked: { label: "Booked", className: "bg-emerald-50 text-emerald-800" },
  quote: { label: "Quote", className: "bg-cyan-50 text-cyan-800" },
  planned: { label: "Planned", className: "bg-gray-100 text-gray-600" },
};

export default function BudgetPane({ refreshKey = 0 }: { refreshKey?: number }) {
  const [budget, setBudget] = useState<Budget | null | undefined>(undefined); // undefined = loading

  useEffect(() => {
    let off = false;
    const sb = supabaseBrowser();
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const b = await loadBudget(sb, data.user.id);
      if (!off) setBudget(b);
    });
    return () => {
      off = true;
    };
  }, [refreshKey]); // reload when the assistant changes the budget or new mail arrives

  if (budget === undefined) return <p className="text-sm text-gray-500">Loading your budget…</p>;
  if (budget === null || (!budget.lines.length && budget.budgetTotal == null))
    return (
      <p className="rounded-2xl bg-white p-6 text-center text-sm text-gray-600 shadow-sm ring-1 ring-gray-900/5">
        No budget yet. Tell the assistant your total budget and what you need, or ask it to &ldquo;plan my budget&rdquo;.
      </p>
    );

  const { budgetTotal, totals, lines } = budget;
  const over = totals.remaining != null && totals.remaining < 0;
  const pct = Math.min(100, totals.percentUsed ?? 0);

  return (
    <div className="space-y-6 text-sm">
      <section className="rounded-3xl bg-white p-6 shadow-lg shadow-gray-900/5 ring-1 ring-gray-900/5">
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
            <p className="mt-2 text-xs text-gray-500">
              {totals.percentUsed}% of your budget planned or committed.
              {over && " Ask the assistant where to adjust."}
            </p>
          </div>
        )}
      </section>

      {lines.length === 0 ? (
        <p className="text-gray-500">No categories yet. Ask the assistant to plan your budget.</p>
      ) : (
        <ul className="divide-y divide-gray-200 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-900/5">
          {lines.map((l) => {
            const overTarget = l.planned != null && l.current != null && l.current > l.planned;
            return (
              <li key={`${l.category}|${l.label ?? ""}`} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-semibold text-gray-900">
                    {name(l)}
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
                  {l.planned != null
                    ? `Target ${usd(l.planned)}${l.plannedBy === "ai" ? " (suggested)" : ""}`
                    : "No target yet"}
                  {l.booked != null && ` · Booked ${usd(l.booked)}${l.bookedNote ? ` — ${l.bookedNote}` : ""}`}
                  {overTarget && " · over target"}
                </p>
                {l.quotes.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {l.quotes.map((q) => (
                      <li key={q.threadId + q.validUntil} className="flex justify-between gap-3 text-xs">
                        <span className="text-gray-700">Quote from {q.vendor}</span>
                        <span className={q.total != null ? "text-gray-900" : "text-gray-500"}>
                          {q.total != null ? usd(q.total) : "Received — open it in Messages to see the price"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p
        className={clsx(
          "mt-1 text-xl font-semibold tracking-tight",
          tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-700" : "text-gray-900"
        )}
      >
        {value}
      </p>
    </div>
  );
}
