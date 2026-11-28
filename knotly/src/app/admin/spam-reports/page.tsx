// Admin: spam lead reports waiting for review (pricing-vendor-wallet-spec.md, step 7).
// Approve = the vendor's $1 comes back. Ban couple = they can't sign in, and every vendor they
// cost a lead is credited.
import { requireAdmin } from "@/lib/admin-session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadSpamQueue, SPAM_REASON_LABELS } from "@/lib/actions/spam";
import SpamReportActions from "@/components/admin/SpamReportActions";
import { panelClasses } from "@/components/ui/fields";

export const metadata = { title: "Spam reports · Knotly admin" };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function SpamReportsPage() {
  await requireAdmin();
  const queue = await loadSpamQueue(supabaseAdmin);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Spam reports</h1>
      <p className="mt-1 text-sm text-gray-600">Leads vendors say were spam. Oldest first.</p>

      {queue.length === 0 ? (
        <p className="mt-8 text-sm text-gray-500">Nothing to review.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {queue.map((r) => (
            <li key={r.id} className={`${panelClasses} space-y-2 p-5`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <p className="font-medium text-gray-900">
                  {r.vendor} → {r.couple?.names ?? "a couple"}
                  {r.couple?.weddingDate && <span className="font-normal text-gray-500"> · wedding {day(r.couple.weddingDate)}</span>}
                </p>
                <time className="text-xs text-gray-500" dateTime={r.created_at}>
                  Reported {day(r.created_at)}
                </time>
              </div>
              <p className="text-sm text-gray-800">
                <span className="font-medium">{SPAM_REASON_LABELS[r.reason]}</span>
                {r.details && <span className="text-gray-600"> — {r.details}</span>}
              </p>
              <SpamReportActions reportId={r.id} coupleId={r.couple?.id ?? null} coupleName={r.couple?.names ?? "this couple"} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
