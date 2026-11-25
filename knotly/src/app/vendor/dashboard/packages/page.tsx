// Packages & Add-ons: what couples can book, and what they can add on top.
import { requireVendor } from "@/lib/vendor-session";
import OfferEditor from "@/components/dashboard/OfferEditor";

export default async function PackagesPage() {
  const { sb, userId } = await requireVendor();
  const { data: vendor } = await sb
    .from("vendors")
    .select(
      "id, vendor_packages(id, name, description, price, inclusions), vendor_addons(id, name, description, price)"
    )
    .eq("id", userId)
    .maybeSingle();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Packages &amp; Add-ons</h1>
      <p className="mt-1 text-sm text-gray-600">
        Your agent prices estimates from these, so keep them current. Prices are whole US dollars.
      </p>
      {!vendor ? (
        <p className="mt-6 rounded-2xl bg-white p-6 text-sm text-gray-600 ring-1 ring-gray-900/5">
          Create your business profile on the Business page first.
        </p>
      ) : (
        <div className="mt-6 space-y-10">
          <OfferEditor kind="package" items={vendor.vendor_packages} />
          <OfferEditor kind="addon" items={vendor.vendor_addons} />
        </div>
      )}
    </div>
  );
}
