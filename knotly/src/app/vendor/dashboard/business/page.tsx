// Business: the listing couples see, and the publish switch.
import { requireVendor } from "@/lib/vendor-session";
import BusinessForm from "@/components/dashboard/BusinessForm";

export default async function BusinessPage() {
  const { sb, userId } = await requireVendor();
  const [{ data: vendor }, { data: metros }] = await Promise.all([
    sb
      .from("vendors")
      .select(
        "business_name, category, bio, metro_slug, website, published, vendor_packages(id), testimonials(id, author_name, rating, body, verified, created_at)"
      )
      .eq("id", userId)
      .maybeSingle(),
    sb.from("metros").select("slug, name, state").order("name"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Business</h1>
      <p className="mt-1 text-sm text-gray-600">
        This is what couples see once you&apos;re live. Add packages on the Packages &amp; Add-ons page, then publish.
      </p>
      <BusinessForm
        metros={metros ?? []}
        vendor={
          vendor && {
            businessName: vendor.business_name,
            category: vendor.category,
            bio: vendor.bio ?? "",
            metro: vendor.metro_slug ?? "",
            website: vendor.website ?? "",
            published: vendor.published,
            packageCount: vendor.vendor_packages.length,
            reviews: [...vendor.testimonials].sort((a, b) => b.created_at.localeCompare(a.created_at)),
          }
        }
      />
    </div>
  );
}
