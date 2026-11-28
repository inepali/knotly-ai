// src/components/dashboard/ReloadForm.tsx — pick $20 … $100 and go to Stripe Checkout.
"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { startWalletReloadAction } from "@/app/vendor/dashboard/actions";

export default function ReloadForm({
  choices,
  canReload,
  lockedNotice,
}: {
  choices: { steps: number; label: string }[];
  canReload: boolean;
  lockedNotice: string;
}) {
  const [steps, setSteps] = useState(1);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  if (!canReload) return <p className="text-sm text-gray-600">{lockedNotice}</p>;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        start(async () => {
          const r = await startWalletReloadAction({ steps });
          if (!r.ok) return setError(r.error);
          window.location.assign(r.url); // Stripe Checkout
        });
      }}
      className="space-y-3"
    >
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-gray-900">Add to your balance</legend>
        <div className="flex flex-wrap gap-2">
          {choices.map((c) => (
            <label
              key={c.steps}
              className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium ${
                steps === c.steps ? "border-cyan-500 bg-cyan-50 text-cyan-800" : "border-gray-300 bg-white text-gray-700"
              }`}
            >
              <input type="radio" name="steps" value={c.steps} checked={steps === c.steps} onChange={() => setSteps(c.steps)} className="sr-only" />
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Opening checkout…" : "Reload"}
        </Button>
        <p className="text-xs text-gray-500">Sales tax is added at checkout. Wallet credit is non-refundable and has no cash value.</p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
