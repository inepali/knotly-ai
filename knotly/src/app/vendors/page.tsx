import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

type Vendor = {
  id: string;
  business_name: string;
  category: string;
  bio: string | null;
  metro_slug: string | null;
  price_min: number | null;
  price_max: number | null;
  vendor_packages: { name: string; price: number; inclusions: string[] }[];
};

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

export default async function VendorsPage(props: PageProps<"/vendors">) {
  const { category } = await props.searchParams;
  const sb = await supabaseServer();

  let query = sb
    .from("vendors")
    .select(
      "id, business_name, category, bio, metro_slug, price_min, price_max, vendor_packages(name, price, inclusions)"
    )
    .eq("published", true)
    .order("business_name");
  if (typeof category === "string") query = query.eq("category", category);

  const { data, error } = await query.returns<Vendor[]>();

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-3xl font-semibold">Vendors</h1>
      {typeof category === "string" && (
        <p className="mt-2 text-gray-600">
          Showing {category}s ·{" "}
          <Link href="/vendors" className="underline">
            show all
          </Link>
        </p>
      )}

      {error && (
        <p className="mt-6 text-red-600">Couldn’t load vendors: {error.message}</p>
      )}
      {data?.length === 0 && (
        <p className="mt-6 text-gray-600">No vendors yet.</p>
      )}

      <ul className="mt-6 space-y-4">
        {data?.map((v) => (
          <li key={v.id} className="rounded-lg border border-gray-200 p-5">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-xl font-medium">{v.business_name}</h2>
              <Link
                href={`/vendors?category=${encodeURIComponent(v.category)}`}
                className="text-sm capitalize text-gray-500 hover:underline"
              >
                {v.category}
              </Link>
            </div>
            {v.bio && <p className="mt-2 text-gray-700">{v.bio}</p>}
            {v.vendor_packages.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {v.vendor_packages.map((p) => (
                  <li key={p.name}>
                    <span className="font-medium">{p.name}</span> —{" "}
                    {usd(p.price)}
                    {p.inclusions.length > 0 && (
                      <span className="text-gray-500">
                        {" "}
                        · {p.inclusions.join(", ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
