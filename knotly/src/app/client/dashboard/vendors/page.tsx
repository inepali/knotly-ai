// Estimates: vendors who responded to your post, grouped by category.
import Link from "next/link";
import { requireCouple } from "@/lib/couple-session";
import { estimateProgress } from "@/lib/actions/posting";
import { categoryLabel } from "@/lib/categories";
import MoreEstimatesButton from "@/components/dashboard/MoreEstimatesButton";
import { panelClasses } from "@/components/ui/fields";

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

type Row = {
  id: string;
  status: string;
  vendors: { id: string; business_name: string; category: string } | null;
  quotes: { total: number; status: string; first_viewed_at: string | null; valid_until: string; created_at: string }[];
};

const STATUS: Record<string, string> = {
  quoted: "Estimate received",
  held: "Date on hold",
};

export default async function EstimatesPage() {
  const { sb, userId } = await requireCouple();
  const [{ data }, progress] = await Promise.all([
    // RLS only lets a couple see post threads once a vendor sent an estimate.
    sb
      .from("threads")
      .select(
        "id, status, vendors(id, business_name, category), quotes!inner(total, status, first_viewed_at, valid_until, created_at)"
      ),
    estimateProgress(sb, userId),
  ]);
  const rows = (data ?? []) as unknown as Row[];
  const info = progress.ok ? progress.data : { posted: false, categories: [] };
  const byCategory = Map.groupBy(rows, (r) => r.vendors?.category ?? "other");
  // Needed categories first (even with no estimates yet), then anything else with estimates.
  const order = [...new Set([...info.categories.map((c) => c.category), ...byCategory.keys()])];

  if (!info.posted && !rows.length)
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Estimates</h1>
        <p className={`${panelClasses} mt-6 p-6 text-sm text-gray-600`}>
          Nothing here yet. Fill in{" "}
          <Link href="/client/dashboard/my-wedding" className="text-cyan-700 underline">
            My Wedding
          </Link>{" "}
          and post to vendors; the ones who are free on your date and fit your budget will send estimates.
        </p>
      </div>
    );

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Estimates</h1>
      <p className="mt-1 text-sm text-gray-600">Vendors who sent you an estimate. Open one to see the price and message them.</p>

      <div className="mt-6 space-y-8">
        {order.map((category) => {
          const list = byCategory.get(category) ?? [];
          const p = info.categories.find((c) => c.category === category);
          return (
            <section key={category}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold">{categoryLabel(category)}</h2>
                {p && (
                  <p className="text-xs text-gray-500">
                    {p.estimates} of {p.cap} estimates
                    {p.waiting > 0 && ` · ${p.waiting} vendor${p.waiting === 1 ? "" : "s"} still responding`}
                  </p>
                )}
              </div>

              {list.length > 0 && (
                <ul className="mt-3 grid gap-4 sm:grid-cols-2">
                  {list.map((r) => {
                    const q = r.quotes.filter((x) => x.status !== "declined" && x.status !== "expired").at(-1) ?? r.quotes.at(-1)!;
                    return (
                      <li key={r.id} className={`${panelClasses} flex flex-col p-5`}>
                        <h3 className="font-semibold text-gray-900">{r.vendors?.business_name ?? "Vendor"}</h3>
                        <p className="mt-1 text-xs text-gray-500">{STATUS[r.status] ?? "Estimate received"}</p>
                        <p className="mt-3 text-sm text-gray-700">
                          {q.first_viewed_at
                            ? `${usd(q.total)} · valid until ${q.valid_until}`
                            : "Your estimate is ready. Open it to see the price."}
                        </p>
                        <Link
                          href={`/inbox/${r.id}`}
                          className="mt-4 inline-flex justify-center rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-600"
                        >
                          {q.first_viewed_at ? "Open conversation" : "Open estimate"}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}

              {p && (
                <div className="mt-3 text-sm text-gray-600">
                  {p.estimates >= p.cap && p.remaining > 0 ? (
                    <MoreEstimatesButton category={category} />
                  ) : p.remaining === 0 && p.waiting === 0 ? (
                    <p>
                      {list.length === 0
                        ? "No available vendors for this category yet."
                        : "No more available vendors for this category yet."}
                    </p>
                  ) : list.length === 0 ? (
                    <p>Matching vendors are looking at your post. Estimates will appear here.</p>
                  ) : null}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
