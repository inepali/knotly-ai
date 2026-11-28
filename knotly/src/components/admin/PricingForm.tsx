// src/components/admin/PricingForm.tsx — edit one pricing_config row (default or a metro).
"use client";
import { useState, useTransition } from "react";
import { removeMetroPricingAction, savePricingAction } from "@/app/admin/actions";
import { centsToDollars, dollarsToCents, type PricingRow } from "@/lib/actions/pricing";
import { fieldClasses, labelClasses } from "@/components/ui/fields";

type Field = { key: string; label: string; money: boolean; hint?: string };
const FIELDS: Field[] = [
  { key: "lead_fee_cents", label: "Lead fee ($)", money: true, hint: "Charged when a couple opens an estimate" },
  { key: "signup_credit_cents", label: "Signup credit ($)", money: true },
  { key: "reload_below_cents", label: "Reload allowed below ($)", money: true },
  { key: "reload_step_cents", label: "Reload step ($)", money: true },
  { key: "reload_max_steps", label: "Max steps per reload", money: false },
  { key: "sms_free_monthly", label: "Free texts a month", money: false },
  { key: "sms_overage_cents", label: "Each text after that ($)", money: true },
];

export default function PricingForm({ row, metroSlug, canRemove }: { row: PricingRow; metroSlug: string | null; canRemove: boolean }) {
  const init = Object.fromEntries(
    FIELDS.map((f) => {
      const v = row[f.key as keyof PricingRow] as number;
      return [f.key, f.money ? centsToDollars(v) : String(v)];
    })
  );
  const [v, setV] = useState<Record<string, string>>(init);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const num = (k: string, money: boolean) => (money ? dollarsToCents(v[k]) : /^\d+$/.test(v[k].trim()) ? Number(v[k]) : Number.NaN);

  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg("");
        setError("");
        start(async () => {
          const r = await savePricingAction({
            metroSlug,
            leadFeeCents: num("lead_fee_cents", true),
            signupCreditCents: num("signup_credit_cents", true),
            reloadBelowCents: num("reload_below_cents", true),
            reloadStepCents: num("reload_step_cents", true),
            reloadMaxSteps: num("reload_max_steps", false),
            smsFreeMonthly: num("sms_free_monthly", false),
            smsOverageCents: num("sms_overage_cents", true),
          });
          if (!r.ok) setError(r.error);
          else setMsg("Saved. Applies to new estimates, texts and reloads.");
        });
      }}
    >
      {FIELDS.map((f) => (
        <label key={f.key} className="block">
          <span className={labelClasses}>{f.label}</span>
          <input
            className={fieldClasses}
            inputMode={f.money ? "decimal" : "numeric"}
            value={v[f.key]}
            onChange={(e) => setV((s) => ({ ...s, [f.key]: e.target.value }))}
            required
          />
          {f.hint && <span className="mt-1 block text-xs text-gray-500">{f.hint}</span>}
        </label>
      ))}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <button type="submit" disabled={pending} className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
          {pending ? "Saving…" : "Save"}
        </button>
        {canRemove && metroSlug && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Remove this metro's prices? It goes back to the default prices.")) return;
              start(async () => {
                const r = await removeMetroPricingAction(metroSlug);
                if (!r.ok) setError(r.error);
              });
            }}
            className="rounded-lg px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-40"
          >
            Use default prices
          </button>
        )}
        {msg && <p className="text-sm text-emerald-700">{msg}</p>}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
