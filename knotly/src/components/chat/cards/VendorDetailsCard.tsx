// src/components/chat/cards/VendorDetailsCard.tsx
// One vendor's packages and reviews (getVendorDetails), shown in the workspace.
type Details = {
  id: string;
  business_name: string;
  category: string;
  bio: string | null;
  vendor_packages: { name: string; price: number; inclusions: string[] | null }[];
  testimonials: { author_name: string; rating: number | null; body: string; verified: boolean }[];
};

export default function VendorDetailsCard({
  data,
  onAsk,
}: {
  data: { ok: boolean; vendor?: Details; error?: string };
  onAsk: (text: string) => void;
}) {
  if (!data.ok || !data.vendor) return <p className="text-sm text-red-600">{data.error}</p>;
  const v = data.vendor;

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500">{v.category.replace("_", " & ")}</p>
        <h3 className="text-lg font-semibold">{v.business_name}</h3>
        {v.bio && <p className="mt-1 text-gray-700 dark:text-gray-300">{v.bio}</p>}
      </div>

      {v.vendor_packages.length > 0 && (
        <section>
          <h4 className="mb-2 font-medium">Packages</h4>
          <ul className="space-y-2">
            {v.vendor_packages.map((p) => (
              <li key={p.name} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                <div className="flex justify-between gap-4">
                  <strong>{p.name}</strong>
                  <span>${p.price.toLocaleString()}</span>
                </div>
                {p.inclusions?.length ? (
                  <p className="mt-1 text-gray-500">{p.inclusions.join(" · ")}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {v.testimonials.length > 0 && (
        <section>
          <h4 className="mb-2 font-medium">Reviews</h4>
          <ul className="space-y-2">
            {v.testimonials.map((t, i) => (
              <li key={i} className="border-l-2 border-gray-200 pl-3 dark:border-gray-800">
                <p>“{t.body}”</p>
                <p className="mt-1 text-xs text-gray-500">
                  {t.author_name}
                  {t.rating ? ` · ${t.rating}★` : ""}
                  {t.verified ? "" : " · unverified"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button
        className="rounded-full bg-black px-4 py-1.5 text-white dark:bg-white dark:text-black"
        onClick={() => onAsk(`I'd like a quote from ${v.business_name} (vendorId ${v.id})`)}
      >
        Request quote
      </button>
    </div>
  );
}
