// Add-ons: what couples can unlock for their wedding ($5 each, once per wedding), what they own, and bundles.
import Link from "next/link";
import { requireCouple } from "@/lib/couple-session";
import { listAddons } from "@/lib/actions/addons";
import { ADDON_ROUTES, formatUsd, type AddonKey } from "@/lib/addons";
import { panelClasses } from "@/components/ui/fields";
import BuyButton from "@/components/addons/BuyButton";

const dateFmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function AddonsPage({ searchParams }: { searchParams: Promise<{ unlocked?: string; canceled?: string }> }) {
  const { unlocked, canceled } = await searchParams;
  const { sb, userId } = await requireCouple();
  const r = await listAddons(sb, userId);
  const { projectId, catalog, owned, active, devUnlocked } = r.ok ? r.data : { projectId: null, catalog: [], owned: [], active: [], devUnlocked: false };
  const singles = catalog.filter((c) => c.kind === "one_time");
  const bundles = catalog.filter((c) => c.kind === "bundle");
  const ownedBy = new Map(owned.map((o) => [o.addon_key, o]));
  const name = (k: string) => catalog.find((c) => c.key === k)?.name ?? k;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Add-ons</h1>
      <p className="mt-1 text-sm text-gray-600">
        Extra planning tools for your wedding. Pay once, no subscription. Each one stays on until 90 days after your
        wedding. Your guest list is always free.
      </p>

      {devUnlocked && (
        <p className="mt-4 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-900">
          Development mode: <code>DEV_UNLOCK_ALL_ADDONS</code> is on, so every add-on is unlocked for testing. Checkout still works.
        </p>
      )}
      {unlocked && (
        <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Thank you! {unlocked.split(",").map(name).join(", ")} {unlocked.includes(",") ? "are" : "is"} unlocking now. It
          can take a few seconds to show up.
        </p>
      )}
      {canceled && (
        <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">Checkout canceled. Nothing was charged.</p>
      )}
      {!projectId && (
        <p className={`${panelClasses} mt-6 p-6 text-sm text-gray-600`}>
          Start with <Link href="/client/dashboard/my-wedding" className="text-cyan-700 underline">My Wedding</Link>, then
          come back to add extras.
        </p>
      )}

      {projectId && (
        <>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {singles.map((c) => {
              const o = ownedBy.get(c.key);
              const isActive = active.includes(c.key);
              const route = ADDON_ROUTES[c.key as AddonKey];
              return (
                <li key={c.key} className={`${panelClasses} flex flex-col p-5`}>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-base font-semibold">{c.name}</h2>
                    <span className="text-sm font-semibold text-gray-900">{formatUsd(c.price_cents)}</span>
                  </div>
                  <p className="mt-1 flex-1 text-sm text-gray-600">{c.blurb}</p>
                  {c.requires.length > 0 && !isActive && (
                    <p className="mt-2 text-xs text-gray-500">Needs {c.requires.map(name).join(" and ")}.</p>
                  )}
                  <div className="mt-4">
                    {isActive ? (
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">
                          ✓ Unlocked · until {dateFmt(o!.active_until)}
                        </span>
                        {route ? (
                          <Link href={route} className="text-cyan-700 underline">Open</Link>
                        ) : (
                          <span className="text-xs text-gray-500">Coming soon</span>
                        )}
                      </div>
                    ) : o ? (
                      <p className="text-sm text-gray-600">Read-only since {dateFmt(o.active_until)}.</p>
                    ) : (
                      <Link href={`/client/dashboard/add-ons/${c.key}`} className="text-sm font-semibold text-cyan-700 underline">
                        See what&apos;s included
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {bundles.length > 0 && (
            <section className="mt-10">
              <h2 className="text-lg font-semibold">Bundles</h2>
              <ul className="mt-3 grid gap-4 sm:grid-cols-2">
                {bundles.map((b) => {
                  const left = b.includes.filter((k) => !active.includes(k));
                  const credit = b.includes
                    .filter((k) => active.includes(k))
                    .reduce((s, k) => s + (catalog.find((c) => c.key === k)?.price_cents ?? 0), 0);
                  const price = Math.max(0, b.price_cents - credit);
                  const worth = b.includes.reduce((s, k) => s + (catalog.find((c) => c.key === k)?.price_cents ?? 0), 0);
                  return (
                    <li key={b.key} className={`${panelClasses} p-5`}>
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-base font-semibold">{b.name}</h3>
                        <span className="text-sm">
                          <span className="font-semibold">{formatUsd(price)}</span>{" "}
                          <s className="text-gray-400">{formatUsd(worth)}</s>
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-600">{b.includes.map(name).join(" · ")}</p>
                      {credit > 0 && left.length > 0 && (
                        <p className="mt-1 text-xs text-gray-500">Includes credit for what you already have.</p>
                      )}
                      <div className="mt-4">
                        {left.length ? (
                          <BuyButton keys={[b.key]} label={`Get the bundle · ${formatUsd(price)}`} />
                        ) : (
                          <span className="text-sm text-emerald-700">✓ You have everything in this bundle</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          <p className="mt-8 text-xs text-gray-500">
            Prices plus any sales tax. Refunds within 7 days if you haven&apos;t used the add-on yet. Contact support.
          </p>
        </>
      )}
    </div>
  );
}
