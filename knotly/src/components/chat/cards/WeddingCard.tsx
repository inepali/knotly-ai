// src/components/chat/cards/WeddingCard.tsx
// The couple's saved plan, shown in the workspace's "My Wedding" tab.
type Wedding = {
  partner_names?: string | null;
  wedding_date?: string | null;
  metro_slug?: string | null;
  venue?: string | null;
  guest_count?: number | null;
  budget_total?: number | null;
  style?: string | null;
  needs?: string[] | null;
};

const rows: [keyof Wedding, string, (v: never) => string][] = [
  ["partner_names", "Couple", (v: string) => v],
  [
    "wedding_date",
    "Date",
    (v: string) =>
      new Date(`${v}T12:00:00`).toLocaleDateString("en-US", { dateStyle: "long" }),
  ],
  ["metro_slug", "City", (v: string) => v.replace(/-([a-z]{2})$/, (_, s) => `, ${s.toUpperCase()}`).replace(/^\w/, (c) => c.toUpperCase())],
  ["venue", "Venue", (v: string) => v],
  ["guest_count", "Guests", (v: number) => v.toLocaleString()],
  ["budget_total", "Budget", (v: number) => `$${v.toLocaleString()}`],
  ["style", "Style", (v: string) => v],
  ["needs", "Still need", (v: string[]) => v.map((n) => n.replace("_", " & ")).join(", ")],
];

export default function WeddingCard({
  data,
}: {
  data: { empty?: true; ok?: boolean; error?: string; wedding?: Wedding; missing?: string[] } & Wedding;
}) {
  if (data.ok === false) return <p className="text-sm text-red-600">{data.error}</p>;
  // getMyWedding returns the row itself; saveWeddingDetails returns { wedding, missing }.
  const w: Wedding = data.wedding ?? data;
  if (data.empty)
    return <p className="text-sm text-gray-500">Nothing saved yet. Tell me your date, city and guest count to get started.</p>;

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      {rows.map(([key, label, fmt]) => {
        const v = w[key];
        const has = v != null && v !== "" && !(Array.isArray(v) && v.length === 0);
        return (
          <div key={key} className="contents">
            <dt className="text-gray-500">{label}</dt>
            <dd className={has ? "" : "text-gray-400"}>{has ? fmt(v as never) : "Not set"}</dd>
          </div>
        );
      })}
    </dl>
  );
}
