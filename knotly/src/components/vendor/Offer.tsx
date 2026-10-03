// src/components/vendor/Offer.tsx — package and add-on cards. The same cards show to
// couples (with "Request quote") and to the vendor in My Business (what couples see).
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Logomark } from "@/components/ui/Logo";

export type Package = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  inclusions?: string[] | null;
};
export type AddOn = { id: string; name: string; description?: string | null; price: number };

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

// Styled after Pocket's pricing cards: the featured package is the dark card.
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
      className={clsx(
        "flex flex-col overflow-hidden rounded-3xl p-6 shadow-lg shadow-gray-900/5",
        featured ? "bg-gray-900" : "bg-white ring-1 ring-gray-900/5"
      )}
    >
      <h4 className={clsx("flex items-center text-sm font-semibold", featured ? "text-white" : "text-gray-900")}>
        <Logomark className="h-6 w-6 flex-none" />
        <span className="ml-3">{pkg.name}</span>
        {featured && (
          <span className="ml-auto rounded-full bg-cyan-500 px-2 py-0.5 text-xs font-semibold text-white">Popular</span>
        )}
      </h4>
      <p className={clsx("mt-5 text-3xl tracking-tight", featured ? "text-white" : "text-gray-900")}>{usd(pkg.price)}</p>
      {pkg.description && (
        <p className={clsx("mt-3 text-sm", featured ? "text-gray-300" : "text-gray-700")}>{pkg.description}</p>
      )}
      {pkg.inclusions?.length ? (
        <ul
          role="list"
          className={clsx(
            "mt-6 divide-y text-sm",
            featured ? "divide-gray-800 text-gray-300" : "divide-gray-200 text-gray-700"
          )}
        >
          {pkg.inclusions.map((item) => (
            <li key={item} className="flex py-2">
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className={clsx("h-6 w-6 flex-none", featured ? "text-white" : "text-cyan-500")}
              >
                <path
                  d="M9.307 12.248a.75.75 0 1 0-1.114 1.004l1.114-1.004ZM11 15.25l-.557.502a.75.75 0 0 0 1.15-.043L11 15.25Zm4.844-5.041a.75.75 0 0 0-1.188-.918l1.188.918Zm-7.651 3.043 2.25 2.5 1.114-1.004-2.25-2.5-1.114 1.004Zm3.4 2.457 4.25-5.5-1.187-.918-4.25 5.5 1.188.918Z"
                  fill="currentColor"
                />
                <circle cx="12" cy="12" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="ml-3">{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {onRequest && (
        <div className="mt-auto pt-6">
          <Button type="button" onClick={onRequest} color={featured ? "cyan" : "gray"} className="w-full">
            Request quote
          </Button>
        </div>
      )}
    </article>
  );
}

export function AddOnCard({ addOn }: { addOn: AddOn }) {
  return (
    <article className="flex items-start justify-between gap-4 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-gray-900/5">
      <div className="min-w-0">
        <h5 className="text-sm font-semibold text-gray-900">{addOn.name}</h5>
        {addOn.description && <p className="mt-0.5 text-sm text-gray-600">{addOn.description}</p>}
      </div>
      <p className="shrink-0 text-sm font-semibold text-cyan-700">+ {usd(addOn.price)}</p>
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
