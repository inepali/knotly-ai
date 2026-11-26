// A vendor's profile, for a couple who received their estimate: what they offer, "Ask this vendor"
// (answers come only from the vendor's own knowledge base), and the message thread.
// For now only those couples (and the vendor previewing their own page) can open it.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { categoryLabel } from "@/lib/categories";
import { VendorOffer, type AddOn, type Package } from "@/components/vendor/Offer";
import HelpChat from "@/components/help/HelpChat";
import { panelClasses } from "@/components/ui/fields";
import { getPortfolio } from "@/lib/actions/vendor-portfolio";
import { toGallery } from "@/lib/portfolio";
import { PortfolioGallery } from "@/components/vendor/PortfolioGallery";

const city = (slug: string | null) =>
  slug ? slug.replace(/-([a-z]{2})$/, (_, s) => `, ${s.toUpperCase()}`).replace(/^\w/, (c) => c.toUpperCase()) : null;

export default async function VendorProfilePage({ params }: PageProps<"/vendors/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || user.is_anonymous) redirect("/signin");

  const [{ data: vendor }, { data: thread }] = await Promise.all([
    sb
      .from("vendors")
      .select(
        "id, business_name, category, bio, metro_slug, website, vendor_packages(id, name, description, price, inclusions), vendor_addons(id, name, description, price), testimonials(id, author_name, rating, body, verified)"
      )
      .eq("id", id)
      .maybeSingle(),
    // RLS: a couple only sees threads with this vendor once they sent an estimate (or the couple started one).
    sb.from("threads").select("id").eq("vendor_id", id).limit(1).maybeSingle(),
  ]);
  if (!vendor || (!thread && user.id !== id)) notFound();
  // Every vendor's portfolio shows here, pay-per-use included (RLS: published vendors or your own).
  const gallery = toGallery(await getPortfolio(sb, id), {
    business: vendor.business_name,
    kind: categoryLabel(vendor.category),
    place: city(vendor.metro_slug),
  });

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
      <Link href="/client/dashboard/vendors" className="text-sm text-cyan-700 underline">
        ← Back to estimates
      </Link>

      <header>
        <p className="text-xs font-semibold tracking-wide text-cyan-700 uppercase">
          {categoryLabel(vendor.category)}
          {city(vendor.metro_slug) && ` · ${city(vendor.metro_slug)}`}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{vendor.business_name}</h1>
        {vendor.website && (
          <a href={vendor.website} target="_blank" rel="noreferrer" className="text-sm text-gray-500 underline-offset-2 hover:underline">
            {vendor.website}
          </a>
        )}
        {vendor.bio && <p className="mt-3 text-gray-700">{vendor.bio}</p>}
        {thread && (
          <Link
            href={`/inbox/${thread.id}`}
            className="mt-4 inline-flex rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-600"
          >
            Open conversation
          </Link>
        )}
      </header>

      <PortfolioGallery photos={gallery.photos} videos={gallery.videos} name={vendor.business_name} />

      <section aria-label={`Ask ${vendor.business_name}`} className={`${panelClasses} flex h-96 flex-col p-5`}>
        <h2 className="text-base font-semibold">Ask {vendor.business_name}</h2>
        <p className="mt-1 mb-3 text-xs text-gray-500">
          Answers come from what {vendor.business_name} has shared (their website, FAQs and brochures). For anything else, message them.
        </p>
        <HelpChat
          vendorId={vendor.id}
          placeholder="e.g. Do you travel outside Charlotte?"
          suggestions={["Do you travel?", "What's your process?", "What is included?"]}
        />
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">What they offer</h2>
        <VendorOffer
          packages={vendor.vendor_packages as Package[]}
          addOns={vendor.vendor_addons as AddOn[]}
          empty="No packages listed."
        />
      </section>

      {vendor.testimonials.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-semibold">Reviews</h2>
          <ul className="space-y-3">
            {vendor.testimonials.slice(0, 5).map((t) => (
              <li key={t.id} className="border-l-2 border-gray-200 pl-3 text-sm">
                <p className="line-clamp-4">&ldquo;{t.body}&rdquo;</p>
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
    </main>
  );
}
