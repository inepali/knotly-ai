// src/components/chat/cards/VendorDetailsCard.tsx
// One vendor's packages, add-ons and reviews (getVendorDetails), shown in the workspace.
import { VendorOffer, type AddOn, type Package } from "@/components/vendor/Offer";
import { categoryLabel } from "@/lib/categories";

type Details = {
  id: string;
  business_name: string;
  category: string;
  bio: string | null;
  vendor_packages: Package[];
  vendor_addons?: AddOn[];
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
    <div className="space-y-5 text-sm">
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500">{categoryLabel(v.category)}</p>
        <h3 className="text-lg font-semibold">{v.business_name}</h3>
        {v.bio && <p className="mt-1 text-gray-700">{v.bio}</p>}
      </div>

      <VendorOffer
        packages={v.vendor_packages}
        addOns={v.vendor_addons ?? []}
        onRequest={(p) => onAsk(`I'd like a quote for the ${p.name} package from ${v.business_name} (vendorId ${v.id})`)}
        empty="This vendor hasn't listed packages yet."
      />

      {v.testimonials.length > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-medium text-gray-500">Reviews</h4>
          <ul className="space-y-2">
            {v.testimonials.map((t, i) => (
              <li key={i} className="border-l-2 border-gray-200 pl-3">
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
        className="rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:border-gray-400 px-4 py-1.5"
        onClick={() => onAsk(`I'd like a quote from ${v.business_name} (vendorId ${v.id})`)}
      >
        Request a custom quote
      </button>
    </div>
  );
}
