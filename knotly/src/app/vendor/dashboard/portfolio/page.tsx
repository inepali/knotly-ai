// Portfolio: up to 25 photos and 3 video links, shown on the vendor's public page, to couples
// who got their estimate, and as the cover on listing cards.
import Link from "next/link";
import { requireVendor } from "@/lib/vendor-session";
import { getPortfolio } from "@/lib/actions/vendor-portfolio";
import { isPublicVendor, REQUIRE_PLAN } from "@/lib/public-listing";
import { vendorPath } from "@/lib/vendor-seo";
import PortfolioEditor from "@/components/dashboard/PortfolioEditor";
import {
  addPortfolioImageAction,
  addPortfolioVideoAction,
  deletePortfolioImageAction,
  deletePortfolioVideoAction,
  reorderPortfolioAction,
  updatePortfolioImageAction,
} from "@/app/vendor/dashboard/actions";

export default async function PortfolioPage() {
  const { sb, userId } = await requireVendor();
  const [portfolio, { data: vendor }] = await Promise.all([
    getPortfolio(sb, userId),
    sb.from("vendors").select("slug, metro_slug, category, published, listed_until").eq("id", userId).maybeSingle(),
  ]);

  const path = vendor ? vendorPath(vendor) : null;
  const live = !!vendor && !!path && isPublicVendor(vendor);
  const lapsed = REQUIRE_PLAN && !!vendor?.listed_until && !live;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
      <p className="mt-1 text-sm text-gray-600">Show couples your work: up to 25 photos and 3 videos.</p>

      <div className="mt-4 rounded-xl bg-cyan-50 px-4 py-3 text-sm text-gray-800">
        {live && path ? (
          <>
            Your public page is live.{" "}
            <Link href={path} className="font-semibold text-cyan-700 hover:underline">
              View page →
            </Link>
          </>
        ) : !vendor?.published ? (
          <>
            Couples see your portfolio once you publish your profile on the{" "}
            <Link href="/vendor/dashboard/business" className="font-semibold text-cyan-700 hover:underline">
              Business page
            </Link>
            .
          </>
        ) : !path ? (
          <>
            Add your city on the{" "}
            <Link href="/vendor/dashboard/business" className="font-semibold text-cyan-700 hover:underline">
              Business page
            </Link>{" "}
            so couples can find your public page.
          </>
        ) : lapsed ? (
          "Your public page is off because your subscription ended. Renew to turn it back on. Couples who get your estimate still see your portfolio."
        ) : (
          "Couples who get your estimate see this portfolio. Upgrade to a monthly or yearly plan to get a public page that shows up on Google."
        )}
      </div>

      <PortfolioEditor
        vendorId={userId}
        images={portfolio.images}
        videos={portfolio.videos}
        actions={{
          addImage: addPortfolioImageAction,
          updateImage: updatePortfolioImageAction,
          deleteImage: deletePortfolioImageAction,
          reorder: reorderPortfolioAction,
          addVideo: addPortfolioVideoAction,
          deleteVideo: deletePortfolioVideoAction,
        }}
      />
    </div>
  );
}
