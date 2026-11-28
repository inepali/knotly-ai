// Account: the vendor's wallet. Balance, reload ($20 steps while under $10), texts this month,
// and the activity ledger with receipts (pricing-vendor-wallet-spec.md).
import Link from "next/link";
import { requireVendor } from "@/lib/vendor-session";
import { panelClasses } from "@/components/ui/fields";
import ReloadForm from "@/components/dashboard/ReloadForm";
import { usd } from "@/lib/actions/wallet";
import {
  ACTIVITY_FILTERS,
  ACTIVITY_PAGE_SIZE,
  activityLabel,
  filterKey,
  leadsLeft,
  pageNumber,
  reloadChoices,
  signedUsd,
  type ActivityRow,
  type WalletSummary,
} from "@/lib/wallet-view";

export const metadata = { title: "Account · Knotly" };

const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function AccountPage(props: PageProps<"/vendor/dashboard/account">) {
  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const kind = filterKey(one(sp.kind));
  const page = pageNumber(one(sp.page));

  const { sb } = await requireVendor();
  const [{ data: summaryRows }, { data: activityRows }] = await Promise.all([
    sb.rpc("wallet_summary"),
    sb.rpc("wallet_activity", { p_kind: kind || null, p_limit: ACTIVITY_PAGE_SIZE, p_offset: (page - 1) * ACTIVITY_PAGE_SIZE }),
  ]);
  const s = ((summaryRows ?? []) as WalletSummary[])[0];
  const rows = (activityRows ?? []) as ActivityRow[];
  const total = rows[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE));
  const href = (k: string, p = 1) => `/vendor/dashboard/account?${new URLSearchParams({ ...(k ? { kind: k } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  if (!s) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="mt-2 text-sm text-gray-600">
          Save your <Link href="/vendor/dashboard/business" className="text-cyan-700 underline">business details</Link> first.
        </p>
      </div>
    );
  }
  const payg = s.plan === "payg";

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
      <p className="mt-1 text-sm text-gray-600">
        Couples see your estimates for free. You pay {usd(s.lead_fee_cents)} only when a couple opens one.
      </p>

      {one(sp.reloaded) && (
        <p role="status" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Thanks! Your payment went through. Your balance updates in a few seconds; refresh if it hasn&apos;t yet.
        </p>
      )}
      {one(sp.canceled) && (
        <p role="status" className="mt-4 rounded-xl bg-gray-100 px-4 py-3 text-sm text-gray-700">
          Reload canceled. Nothing was charged.
        </p>
      )}

      <section className={`${panelClasses} mt-6 grid gap-4 p-6 sm:grid-cols-4`} aria-label="Balance">
        <Stat label="Balance" value={usd(s.balance_cents)} />
        <Stat label="On hold" value={usd(s.held_cents)} hint="Set aside for estimates not opened yet" />
        <Stat label="Available" value={usd(s.available_cents)} strong />
        <Stat label="About" value={`${leadsLeft(s)} lead${leadsLeft(s) === 1 ? "" : "s"}`} hint={`at ${usd(s.lead_fee_cents)} each`} />
      </section>

      {payg && s.available_cents < s.lead_fee_cents && (
        <p role="alert" className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          New leads and over-limit texts are paused until you reload.
        </p>
      )}

      {payg && (
        <section className={`${panelClasses} mt-6 p-6`} aria-label="Reload">
          <ReloadForm
            choices={reloadChoices(s)}
            canReload={s.can_reload}
            lockedNotice={`You can reload when your balance drops below ${usd(s.reload_below_cents)}.`}
          />
        </section>
      )}

      <section className={`${panelClasses} mt-6 p-6 text-sm`} aria-label="Texts this month">
        <p className="font-semibold text-gray-900">Texts this month</p>
        <p className="mt-1 text-gray-700">
          {payg
            ? `${Math.min(s.sms_used_this_month, s.sms_free_monthly)} of ${s.sms_free_monthly} free used`
            : `${s.sms_used_this_month} sent`}
          {s.sms_spent_this_month_cents > 0 && ` · ${usd(s.sms_spent_this_month_cents)} over the free texts`}
        </p>
      </section>

      <section className={`${panelClasses} mt-6 p-6`} aria-label="Activity">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-gray-900">Activity</p>
          <nav className="flex flex-wrap gap-1 text-sm" aria-label="Filter activity">
            {ACTIVITY_FILTERS.map((f) => (
              <Link
                key={f.key}
                href={href(f.key)}
                aria-current={kind === f.key ? "page" : undefined}
                className={`rounded-lg px-2.5 py-1 ${kind === f.key ? "bg-cyan-50 font-medium text-cyan-800" : "text-gray-600 hover:bg-gray-100"}`}
              >
                {f.label}
              </Link>
            ))}
          </nav>
        </div>

        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">Nothing here yet.</p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs text-gray-500">
              <tr>
                <th className="py-2 font-medium">Date</th>
                <th className="py-2 font-medium">What</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="py-2 whitespace-nowrap text-gray-600">{when(r.created_at)}</td>
                  <td className="py-2 text-gray-800">
                    {r.thread_id ? (
                      <Link href={`/inbox/${r.thread_id}`} className="hover:underline">
                        {activityLabel(r)}
                      </Link>
                    ) : (
                      activityLabel(r)
                    )}
                    {r.has_receipt && (
                      <>
                        {" · "}
                        <a href={`/api/wallet/receipt/${r.id}`} target="_blank" rel="noopener noreferrer" className="text-cyan-700 underline">
                          Receipt
                        </a>
                      </>
                    )}
                  </td>
                  <td className={`py-2 text-right tabular-nums ${r.amount_cents < 0 ? "text-gray-900" : "text-emerald-700"}`}>
                    {signedUsd(r.amount_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {pages > 1 && (
          <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Activity pages">
            {page > 1 ? <Link href={href(kind, page - 1)} className="text-cyan-700 hover:underline">← Newer</Link> : <span />}
            <span className="text-gray-500">
              Page {page} of {pages}
            </span>
            {page < pages ? <Link href={href(kind, page + 1)} className="text-cyan-700 hover:underline">Older →</Link> : <span />}
          </nav>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 tabular-nums ${strong ? "text-2xl font-semibold text-gray-900" : "text-lg font-medium text-gray-800"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
