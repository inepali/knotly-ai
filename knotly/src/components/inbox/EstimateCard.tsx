// src/components/inbox/EstimateCard.tsx — an estimate inside a conversation. The couple presses
// "Review estimate" to see the price (view_quote: the vendor is charged once, on the first open).
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { isExpired, type Estimate, type EstimateLine } from "@/lib/estimates";

const usd = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US")}`;
const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function Lines({ lines, total }: { lines: EstimateLine[]; total: number }) {
  return (
    <table className="mt-3 w-full text-sm">
      <tbody>
        {lines.map((l, i) => (
          <tr key={i} className="border-b border-gray-100">
            <td className="py-1.5 text-gray-700">{l.label}</td>
            <td className={`py-1.5 text-right tabular-nums ${l.amount < 0 ? "text-emerald-700" : "text-gray-900"}`}>{usd(l.amount)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td className="pt-2 font-semibold text-gray-900">Total</td>
          <td className="pt-2 text-right text-base font-semibold tabular-nums text-gray-900">{usd(total)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

export default function EstimateCard({ estimate, side }: { estimate: Estimate; side: "couple" | "vendor" }) {
  const router = useRouter();
  const [shown, setShown] = useState<{ total: number; lines: EstimateLine[] } | null>(
    estimate.total != null && estimate.lines ? { total: estimate.total, lines: estimate.lines } : null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const expired = isExpired(estimate);

  async function open() {
    setBusy(true);
    setError("");
    const { data, error: e } = await supabaseBrowser().rpc("view_quote", { p_quote: estimate.id });
    setBusy(false);
    const row = (Array.isArray(data) ? data[0] : data) as { total: number; line_items: EstimateLine[] } | undefined;
    if (e || !row) return setError("We couldn't open this estimate. Please try again.");
    setShown({ total: row.total, lines: row.line_items });
    router.refresh(); // Estimates page and budget now show the price too
  }

  return (
    <div className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900">Estimate</p>
        <p className={`text-xs ${expired ? "text-red-700" : "text-gray-500"}`}>
          {expired ? `Expired ${day(estimate.validUntil)}` : `Valid until ${day(estimate.validUntil)}`}
          {side === "vendor" && ` · ${estimate.opened ? "opened by the couple" : "not opened yet"}`}
        </p>
      </div>
      {shown ? (
        <>
          <Lines lines={shown.lines} total={shown.total} />
          <p className="mt-3 text-xs text-gray-500">Estimates are confirmed in your contract.</p>
        </>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={open}
            disabled={busy}
            className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50"
          >
            {busy ? "Opening…" : "Review estimate"}
          </button>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
