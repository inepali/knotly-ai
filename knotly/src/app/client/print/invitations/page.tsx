// Print-ready 5×7 cards (Print → Save as PDF). One card, or one per household with its own QR code.
import type { Metadata } from "next";
import { requireAddon } from "@/lib/addon-access";
import { cardLink, loadInvitations } from "@/lib/actions/invitations";
import { siteUrl } from "@/lib/site";
import PrintCard from "@/components/invitations/PrintCard";
import PrintButton from "@/components/invitations/PrintButton";
import type { Kind } from "@/lib/invitations";

export const metadata: Metadata = { title: "Print · Knotly", robots: { index: false } };

export default async function PrintInvitations({ searchParams }: { searchParams: Promise<{ kind?: string; each?: string }> }) {
  const q = await searchParams;
  const kind: Kind = q.kind === "invitation" ? "invitation" : "save_the_date";
  const { sb, userId } = await requireAddon("invitations");
  const r = await loadInvitations(sb, userId);
  if (!r.ok) return <p className="p-8 text-sm text-red-600">{r.error}</p>;
  const d = r.data;
  const base = siteUrl();
  const general = d.site ? `${base}/w/${d.site.slug}${kind === "invitation" && d.rsvp ? "/rsvp" : ""}` : base;
  const cards = q.each === "1" && d.households.length
    ? d.households.map((h) => ({ key: h.id, link: cardLink(d, kind, h.invite_token, base), label: h.label, code: d.rsvp && kind === "invitation" ? h.rsvp_code : null }))
    : [{ key: "one", link: general, label: null, code: null }];

  return (
    <main className="bg-gray-100 print:bg-white">
      <style>{`@page { size: 5in 7in; margin: 0 } @media print { .card { break-after: page; box-shadow: none !important; margin: 0 !important } }`}</style>
      <div className="flex items-center justify-between gap-3 p-4 print:hidden">
        <p className="text-sm text-gray-700">
          {cards.length} card{cards.length === 1 ? "" : "s"}, 5×7 in. Use Print → Save as PDF, or send to a print shop.
          {!d.site?.published && " Your website isn't published yet, so the QR code won't open anything until it is."}
        </p>
        <PrintButton />
      </div>
      {cards.map((c) => (
        <PrintCard key={c.key} kind={kind} data={d} link={c.link} householdLabel={c.label} code={c.code} />
      ))}
    </main>
  );
}
