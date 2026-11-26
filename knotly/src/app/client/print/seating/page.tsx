// Printable seating plan (one block per table) and an alphabetical escort list.
import type { Metadata } from "next";
import { requireAddon } from "@/lib/addon-access";
import { loadSeating } from "@/lib/actions/seating";
import { escortList, plan } from "@/lib/seating";
import PrintButton from "@/components/invitations/PrintButton";

export const metadata: Metadata = { title: "Seating plan · Knotly", robots: { index: false } };

export default async function PrintSeating() {
  const { sb, userId } = await requireAddon("seating");
  const r = await loadSeating(sb, userId);
  if (!r.ok) return <p className="p-8 text-sm text-red-600">{r.error}</p>;
  const { tables, people, assignments } = r.data;
  const p = plan(tables, people, assignments);
  const escort = escortList(tables, p);
  return (
    <main className="mx-auto max-w-4xl p-8 font-serif text-gray-900">
      <style>{`@page { margin: 0.5in } @media print { .break { break-before: page } }`}</style>
      <div className="mb-6 flex items-center justify-between print:hidden">
        <p className="text-sm text-gray-600">{p.unseated.length ? `${p.unseated.length} people aren't seated yet.` : "Everyone is seated."}</p>
        <PrintButton />
      </div>
      <h1 className="text-center text-3xl">Seating plan</h1>
      <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3">
        {tables.map((t) => (
          <section key={t.id} className="break-inside-avoid">
            <h2 className="border-b border-gray-300 pb-1 text-lg">{t.name}</h2>
            <ul className="mt-1 text-sm">{(p.byTable.get(t.id) ?? []).map((s) => <li key={s.key}>{s.name}</li>)}</ul>
          </section>
        ))}
      </div>
      <section className="break mt-12">
        <h1 className="text-center text-3xl">Find your seat</h1>
        <ul className="mt-6 columns-2 gap-8 text-sm sm:columns-3">
          {escort.map((e, i) => (
            <li key={i} className="flex justify-between gap-2 break-inside-avoid border-b border-dotted border-gray-300 py-1">
              <span>{e.name}</span>
              <span>{e.table}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
