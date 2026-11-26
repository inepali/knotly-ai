// Address labels on Avery 5160 / 8160 sheets (30 per page, 2⅝" × 1"). Print at 100% scale.
import type { Metadata } from "next";
import { requireAddon } from "@/lib/addon-access";
import { loadThankYou } from "@/lib/actions/thank-you";
import { addressLines, labelHouseholds } from "@/lib/thank-you";
import PrintButton from "@/components/invitations/PrintButton";

export const metadata: Metadata = { title: "Address labels · Knotly", robots: { index: false } };

export default async function Labels({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { all } = await searchParams;
  const { sb, userId } = await requireAddon("thank_you");
  const r = await loadThankYou(sb, userId);
  if (!r.ok) return <p className="p-8 text-sm text-red-600">{r.error}</p>;
  const hh = labelHouseholds(r.data.households, r.data.gifts, all !== "1");
  const labels = hh.map((h) => ({ id: h.id, lines: addressLines(h) })).filter((l): l is { id: string; lines: string[] } => !!l.lines);
  const missing = hh.length - labels.length;
  const pages = Array.from({ length: Math.ceil(labels.length / 30) }, (_, i) => labels.slice(i * 30, i * 30 + 30));
  return (
    <main>
      <style>{`@page { size: letter; margin: 0 } @media print { .sheet { break-after: page; box-shadow: none !important; margin: 0 !important } }`}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm print:hidden">
        <p>
          {labels.length} label{labels.length === 1 ? "" : "s"} for Avery 5160 (print at 100%, no scaling).
          {missing > 0 && ` ${missing} household${missing === 1 ? " has" : "s have"} no street address on the Guest List.`}{" "}
          <a className="text-cyan-700 underline" href={all === "1" ? "?" : "?all=1"}>{all === "1" ? "Only households waiting for a thank-you" : "Every household"}</a>
        </p>
        <PrintButton />
      </div>
      {pages.map((page, i) => (
        <section key={i} className="sheet mx-auto my-4 bg-white shadow-xl" style={{ width: "8.5in", height: "11in", padding: "0.5in 0.1875in", boxSizing: "border-box" }}>
          <div className="grid" style={{ gridTemplateColumns: "repeat(3, 2.625in)", gridAutoRows: "1in", columnGap: "0.125in" }}>
            {page.map((l) => (
              <div key={l.id} className="flex flex-col justify-center overflow-hidden font-sans leading-tight" style={{ padding: "0 0.15in", fontSize: "10pt" }}>
                {l.lines.map((line, j) => <span key={j} className="truncate">{line}</span>)}
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
