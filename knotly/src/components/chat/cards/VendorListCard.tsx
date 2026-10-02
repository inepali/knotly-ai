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

  return (
    <div className="grid gap-3 text-left">
      {data.vendors.map((v) => (
        <div key={v.id} className="rounded-2xl border p-4 shadow-sm">
          <div className="flex items-baseline justify-between">
            <strong>{v.name}</strong>
            <span className="text-xs text-gray-500">{v.match}% match</span>
          </div>
          <p className="text-sm text-gray-600">
            From ${v.priceFrom.toLocaleString()}
            {v.rating ? ` · ${v.rating}★ (${v.reviews})` : " · New"}
            {v.miles != null && ` · ${v.miles} mi`}
          </p>
          <p className="mt-1 line-clamp-2 text-sm">{v.blurb}</p>
          <div className="mt-3 flex gap-2">
            <button
              className="rounded-full border px-3 py-1 text-sm"
              onClick={() =>
                onAsk(`Tell me more about ${v.name} (vendorId ${v.id})`)
              }
            >
              Details
            </button>
            <button
              className="rounded-full bg-black px-3 py-1 text-sm text-white"
              onClick={() =>
                onAsk(`I'd like a quote from ${v.name} (vendorId ${v.id})`)
              }
            >
              Request quote
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
