// src/components/chat/cards/VendorListCard.tsx
type Vendor = {
  id: string;
  name: string;
  priceFrom: number;
  rating: number | null;
  reviews: number;
  miles: number | null;
  match: number;
  blurb: string;
};

export default function VendorListCard({
  data,
  onAsk,
}: {
  data: {
    ok: boolean;
    category: string;
    city?: string;
    vendors: Vendor[];
    error?: string;
  };
  onAsk: (text: string) => void;
}) {
  if (!data.ok) return <p className="text-sm text-red-600">{data.error}</p>;
  if (!data.vendors.length)
    return (
      <p className="text-sm">
        No matches. Try a higher budget or wider distance.
      </p>
    );

  // Columns follow the pane's width (container query), not the window's:
  // three across when there's room, two on a narrow pane, one on phones.
  return (
    <div className="@container">
      <div className="grid gap-3 text-left @md:grid-cols-2 @2xl:grid-cols-3">
        {data.vendors.map((v) => (
          <article
            key={v.id}
            className="flex h-full flex-col rounded-2xl border border-gray-200 p-4 shadow-sm dark:border-gray-800"
          >
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-semibold leading-snug">{v.name}</h4>
              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-400">
                {v.match}% match
              </span>
            </div>
            <p className="mt-1 text-lg font-semibold">
              <span className="text-xs font-normal text-gray-500">From </span>${v.priceFrom.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500">
              {v.rating ? `${v.rating}★ (${v.reviews})` : "New"}
              {v.miles != null && ` · ${v.miles} mi away`}
            </p>
            <p className="mt-2 line-clamp-3 text-sm text-gray-700 dark:text-gray-300">{v.blurb}</p>
            <div className="mt-auto flex gap-2 pt-4">
              <button
                className="flex-1 rounded-full border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
                onClick={() => onAsk(`Tell me more about ${v.name} (vendorId ${v.id})`)}
              >
                Details
              </button>
              <button
                className="flex-1 rounded-full bg-black px-3 py-1.5 text-sm text-white dark:bg-white dark:text-black"
                onClick={() => onAsk(`I'd like a quote from ${v.name} (vendorId ${v.id})`)}
              >
                Request quote
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
