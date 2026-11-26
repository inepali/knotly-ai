// One add-on's preview: what's included, what it costs (with anything it needs), and a cheaper bundle if there is one.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireCouple } from "@/lib/couple-session";
import { listAddons, quoteAddons } from "@/lib/actions/addons";
import { ADDON_ROUTES, formatUsd, type AddonKey } from "@/lib/addons";
import { ADDON_FEATURES } from "@/lib/addon-features";
import { panelClasses } from "@/components/ui/fields";
import BuyButton from "@/components/addons/BuyButton";

export default async function AddonPreviewPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const { sb, userId } = await requireCouple();
  const list = await listAddons(sb, userId);
  if (!list.ok) notFound();
  const { catalog, active, projectId } = list.data;
  const item = catalog.find((c) => c.key === key && c.kind === "one_time");
  if (!item) notFound();
  if (!projectId) redirect("/client/dashboard/my-wedding");

  const route = ADDON_ROUTES[key as AddonKey];
  if (active.includes(key) && route) redirect(route);

  const q = active.includes(key) ? null : await quoteAddons(sb, userId, { keys: [key] });
  const cart = q?.ok ? q.data.cart : null;
  const better = q?.ok ? q.data.better : null;
  const name = (k: string) => catalog.find((c) => c.key === k)?.name ?? k;

  return (
    <div>
      <Link href="/client/dashboard/add-ons" className="text-sm text-cyan-700 underline">← All add-ons</Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{item.name}</h1>
      <p className="mt-1 text-sm text-gray-600">{item.blurb}</p>

      <section className={`${panelClasses} mt-6 p-6`}>
        <h2 className="text-base font-semibold">What you get</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-700">
          {(ADDON_FEATURES[key as AddonKey] ?? []).map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </section>

      <section className={`${panelClasses} mt-4 p-6`}>
        {active.includes(key) ? (
          <p className="text-sm text-emerald-700">✓ Unlocked. This page is coming soon.</p>
        ) : cart ? (
          <>
            <ul className="space-y-1 text-sm">
              {cart.lines.map((l) => (
                <li key={l.key} className="flex justify-between">
                  <span>
                    {l.name}
                    {cart.addedForYou.includes(l.key) && <span className="ml-2 text-xs text-gray-500">needed for {item.name}</span>}
                  </span>
                  <span>{formatUsd(l.amount_cents)}</span>
                </li>
              ))}
              <li className="flex justify-between border-t border-gray-100 pt-2 font-semibold">
                <span>Total, paid once</span>
                <span>{formatUsd(cart.total_cents)}</span>
              </li>
            </ul>
            <div className="mt-4 flex flex-wrap items-start gap-3">
              <BuyButton keys={cart.keys} label={`Unlock for ${formatUsd(cart.total_cents)}`} />
              {better && (
                <BuyButton
                  keys={[better.key]}
                  variant="outline"
                  label={`Or get the ${name(better.key)} for ${formatUsd(better.total_cents)}`}
                />
              )}
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Stays on until 90 days after your wedding. Plus any sales tax. Secure checkout by Stripe.
            </p>
          </>
        ) : (
          <p className="text-sm text-red-600">{q && !q.ok ? q.error : "Not available right now."}</p>
        )}
      </section>
    </div>
  );
}
