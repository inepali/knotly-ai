// src/components/couple/VendorsPane.tsx — the couple's permanent "Vendors" tab: vendors
// they're already in touch with, where each conversation stands, and any quote.
"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/Button";
import { categoryLabel } from "@/lib/categories";

type Row = {
  id: string;
  status: string;
  vendors: { id: string; business_name: string; category: string } | null;
  quotes: { total: number; status: string; first_viewed_at: string | null; valid_until: string }[];
  messages: { created_at: string; status: string }[];
};

// threads.status → what the couple sees
const STATUS: Record<string, { label: string; className: string }> = {
  open: { label: "Inquiry sent", className: "bg-gray-100 text-gray-700" },
  quoted: { label: "Quote received", className: "bg-cyan-50 text-cyan-800" },
  held: { label: "Date on hold", className: "bg-emerald-50 text-emerald-800" },
  declined: { label: "Not available", className: "bg-red-50 text-red-700" },
  waiting_credits: { label: "Waiting for vendor", className: "bg-amber-50 text-amber-800" },
};

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

export default function VendorsPane({
  refreshKey = 0,
  onOpenThread,
  onAsk,
}: {
  refreshKey?: number;
  onOpenThread: (threadId: string) => void; // opens the conversation in Messages
  onAsk: (text: string) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let off = false;
    supabaseBrowser()
      .from("threads")
      .select(
        "id, status, vendors(id, business_name, category), quotes(total, status, first_viewed_at, valid_until), messages(created_at, status)"
      )
      .then(({ data }) => {
        if (off) return;
        const sorted = ((data ?? []) as unknown as Row[]).sort((a, b) => last(b).localeCompare(last(a)));
        setRows(sorted);
      });
    return () => {
      off = true;
    };
  }, [refreshKey]); // reload when new mail arrives

  if (!rows) return <p className="text-sm text-gray-500">Loading your vendors…</p>;
  if (!rows.length)
    return (
      <p className="rounded-2xl bg-white p-6 text-center text-sm text-gray-600 shadow-sm ring-1 ring-gray-900/5">
        You haven&apos;t contacted any vendors yet. Ask the assistant to find some, then request a quote.
      </p>
    );

  return (
    <div className="@container">
      <div className="grid gap-4 @md:grid-cols-2 @2xl:grid-cols-3">
        {rows.map((r) => {
          const sent = r.messages.some((m) => m.status === "sent");
          const status = sent ? (STATUS[r.status] ?? STATUS.open) : { label: "Draft not sent", className: "bg-amber-50 text-amber-800" };
          const quote = r.quotes.filter((q) => q.status !== "declined" && q.status !== "expired").at(-1);
          return (
            <article key={r.id} className="flex flex-col rounded-3xl bg-white p-5 shadow-lg shadow-gray-900/5 ring-1 ring-gray-900/5">
              <p className="text-xs font-semibold tracking-wide text-cyan-700 uppercase">
                {r.vendors && categoryLabel(r.vendors.category)}
              </p>
              <h3 className="mt-1 font-semibold text-gray-900">{r.vendors?.business_name ?? "Vendor"}</h3>
              <span className={clsx("mt-2 self-start rounded-full px-2 py-0.5 text-xs font-medium", status.className)}>
                {status.label}
              </span>
              <p className="mt-3 text-sm text-gray-600">
                {quote
                  ? quote.first_viewed_at
                    ? `Quote ${usd(quote.total)} · valid until ${quote.valid_until}`
                    : "Quote received — open it to see the price"
                  : `Last activity ${new Date(last(r)).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
              </p>
              <div className="mt-auto flex gap-2 pt-5">
                <Button type="button" color="cyan" className="flex-1" onClick={() => onOpenThread(r.id)}>
                  Conversation
                </Button>
                {r.vendors && (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => onAsk(`Tell me more about ${r.vendors!.business_name} (vendorId ${r.vendors!.id})`)}
                  >
                    Details
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

const last = (r: Row) => r.messages.map((m) => m.created_at).sort().at(-1) ?? "";
