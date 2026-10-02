// src/components/chat/cards/BusinessCard.tsx
// A vendor's own listing as it builds up (getMyBusiness / saveBusinessProfile).
type Business = {
  business_name: string;
  category: string;
  bio: string | null;
  metro_slug: string | null;
  price_min: number | null;
  published: boolean;
  vendor_packages: { id: string; name: string; price: number }[];
  testimonials: { id: string }[];
};

export default function BusinessCard({
  data,
}: {
  data: { empty?: true; ok?: boolean; error?: string; profile?: Business | null } & Partial<Business>;
}) {
  if (data.ok === false) return <p className="text-sm text-red-600">{data.error}</p>;
  // getMyBusiness returns the row itself; saveBusinessProfile returns { profile }.
  const b = (data.profile ?? data) as Business;
  if (data.empty || !b.business_name)
    return <p className="text-sm text-gray-500">No listing yet. Tell me your business name and what you do.</p>;

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">{b.category.replace("_", " & ")}</p>
          <h3 className="text-lg font-semibold">{b.business_name}</h3>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            b.published
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-gray-100 text-gray-600 dark:bg-gray-900 dark:text-gray-400"
          }`}
        >
          {b.published ? "Live" : "Draft"}
        </span>
      </div>
      {b.bio && <p className="text-gray-700 dark:text-gray-300">{b.bio}</p>}
      <p className="text-gray-500">
        {b.vendor_packages.length} package{b.vendor_packages.length === 1 ? "" : "s"}
        {b.price_min ? ` · from $${b.price_min.toLocaleString()}` : ""} · {b.testimonials.length} review
        {b.testimonials.length === 1 ? "" : "s"}
      </p>
      {b.vendor_packages.length > 0 && (
        <ul className="space-y-1">
          {b.vendor_packages.map((p) => (
            <li key={p.id} className="flex justify-between">
              <span>{p.name}</span>
              <span>${p.price.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
