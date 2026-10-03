// src/components/vendor/Offer.tsx — package and add-on cards. The same cards show to
// couples (with "Request quote") and to the vendor in My Business (what couples see).
export type Package = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  inclusions?: string[] | null;
};
export type AddOn = { id: string; name: string; description?: string | null; price: number };

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

export function PackageCard({
  pkg,
  featured,
  onRequest,
}: {
  pkg: Package;
  featured?: boolean; // e.g. the middle tier
  onRequest?: () => void; // couples only
}) {
  return (
    <article
      className={`flex flex-col rounded-2xl border p-4 ${
        featured ? "border-black shadow-sm dark:border-white" : "border-gray-200 dark:border-gray-800"
      }`}
    >
      <header className="flex items-baseline justify-between gap-3">
        <h4 className="font-semibold">{pkg.name}</h4>
        {featured && (
          <span className="rounded-full bg-black px-2 py-0.5 text-xs text-white dark:bg-white dark:text-black">Popular</span>
        )}
      </header>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{usd(pkg.price)}</p>
      {pkg.description && <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{pkg.description}</p>}
      {pkg.inclusions?.length ? (
        <ul className="mt-3 space-y-1.5 text-sm">
          {pkg.inclusions.map((item) => (
            <li key={item} className="flex gap-2">
              <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" fill="currentColor" aria-hidden>
                <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" />
              </svg>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {onRequest && (
        <button
          type="button"
          onClick={onRequest}
          className="mt-4 rounded-full bg-black px-4 py-2 text-sm text-white dark:bg-white dark:text-black"
        >
          Request quote
        </button>
      )}
    </article>
  );
}

export function AddOnCard({ addOn }: { addOn: AddOn }) {
  return (
    <article className="flex items-start justify-between gap-4 rounded-xl border border-dashed border-gray-300 px-4 py-3 dark:border-gray-700">
      <div className="min-w-0">
        <h5 className="font-medium">{addOn.name}</h5>
        {addOn.description && <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">{addOn.description}</p>}
      </div>
      <p className="shrink-0 font-semibold">+ {usd(addOn.price)}</p>
    </article>
  );
}

// Packages (cheapest first) then add-ons. Pass onRequest to show couples the buttons.
export function VendorOffer({
  packages,
  addOns,
  onRequest,
  empty,
}: {
  packages: Package[];
  addOns: AddOn[];
  onRequest?: (pkg: Package) => void;
  empty?: string;
}) {
  if (!packages.length && !addOns.length)
    return empty ? <p className="text-sm text-gray-500">{empty}</p> : null;
  const sorted = [...packages].sort((a, b) => a.price - b.price);
  // With three or more tiers, highlight the middle one.
  const featured = sorted.length >= 3 ? sorted[Math.floor(sorted.length / 2)].id : null;

  return (
    <div className="space-y-5">
      {sorted.length > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-medium text-gray-500">Packages</h4>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sorted.map((p) => (
              <PackageCard
                key={p.id}
                pkg={p}
                featured={p.id === featured}
                onRequest={onRequest ? () => onRequest(p) : undefined}
              />
            ))}
          </div>
        </section>
      )}
      {addOns.length > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-medium text-gray-500">Add-ons</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {addOns.map((a) => (
              <AddOnCard key={a.id} addOn={a} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
