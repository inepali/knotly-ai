// src/app/page.tsx — home: what Knotly does for couples and vendors, kept to one simple scroll.
// Add-on names and prices come from addon_catalog (refreshed hourly), so they never go stale.
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatUsd, type CatalogItem } from "@/lib/addons";
import { SITE_NAME, siteUrl } from "@/lib/site";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `${SITE_NAME}: post your wedding once, get estimates from vendors who are free`,
  description:
    "Tell Knotly your date, city, budget and the vendors you need. Vendors who are free on your day and fit your budget send estimates. Free for couples in the Carolinas.",
  alternates: { canonical: siteUrl() },
};

const STEPS = [
  { title: "Post your wedding once", body: "Date, city, guest count, budget, and the vendors you need. No calls, no forms on ten different sites." },
  { title: "Get estimates from vendors who fit", body: "Only vendors who are free on your date and fit your budget reply. Up to 5 per category, and you can ask for more." },
  { title: "Compare, message and book", body: "Open the estimates you like, message vendors in one inbox, and keep your budget up to date as you book." },
];

const FREE = ["My Wedding details", "Vendor estimates", "Messages with every vendor", "Budget", "Guest list"];

async function loadAddons(): Promise<CatalogItem[]> {
  try {
    const { data } = await supabaseAdmin.from("addon_catalog").select("*").eq("active", true).order("sort");
    return (data ?? []) as CatalogItem[];
  } catch {
    return [];
  }
}

export default async function Home() {
  const catalog = await loadAddons();
  const addons = catalog.filter((c) => c.kind === "one_time");
  const bundles = catalog.filter((c) => c.kind === "bundle");
  const price = addons[0] && addons.every((a) => a.price_cents === addons[0].price_cents) ? formatUsd(addons[0].price_cents) : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="py-20 sm:py-28">
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold tracking-wide text-cyan-700">Free for couples · Charlotte & the Carolinas</p>
              <h1 className="mt-4 text-4xl font-medium tracking-tight text-gray-900 sm:text-5xl">
                Post your wedding once. Let the right vendors come to you.
              </h1>
              <p className="mt-6 text-lg text-gray-600">
                Vendors who are free on your day and fit your budget send you estimates. Then plan the rest (guests,
                website, RSVPs) in the same place.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-4">
                <Button href="/signup" color="cyan">
                  Post your wedding, free
                </Button>
                <Button href="/wedding-vendors" variant="outline">
                  Browse vendors
                </Button>
              </div>
              <p className="mt-6 text-sm text-gray-500">
                Already have an account?{" "}
                <Link href="/signin" className="text-cyan-700 underline">
                  Sign in
                </Link>
              </p>
            </div>
          </Container>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-8 border-t border-gray-100 bg-gray-50 py-20">
          <Container>
            <h2 className="text-center text-3xl font-medium tracking-tight text-gray-900">How it works</h2>
            <ol className="mx-auto mt-12 grid max-w-5xl gap-8 sm:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500 text-sm font-semibold text-white">{i + 1}</span>
                  <h3 className="mt-4 text-lg font-semibold text-gray-900">{s.title}</h3>
                  <p className="mt-2 text-sm text-gray-600">{s.body}</p>
                </li>
              ))}
            </ol>
          </Container>
        </section>

        {/* Planning tools */}
        <section id="planning" className="scroll-mt-8 py-20">
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-medium tracking-tight text-gray-900">Plan the rest, all in one place</h2>
              <p className="mt-4 text-gray-600">
                The basics are free. Add only what you need{price ? `, ${price} each,` : ""} paid once per wedding. No
                subscription.
              </p>
            </div>
            <div className="mx-auto mt-12 grid max-w-5xl gap-6 lg:grid-cols-3">
              <div className="rounded-2xl p-6 ring-1 ring-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Always free</h3>
                <ul className="mt-4 space-y-2 text-sm text-gray-700">
                  {FREE.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span aria-hidden="true" className="text-cyan-600">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl p-6 ring-1 ring-gray-200 lg:col-span-2">
                <h3 className="text-lg font-semibold text-gray-900">Add-ons</h3>
                {addons.length > 0 ? (
                  <ul className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                    {addons.map((a) => (
                      <li key={a.key}>
                        <p className="font-medium text-gray-900">
                          {a.name}
                          {!price && <span className="ml-2 font-normal text-gray-500">{formatUsd(a.price_cents)}</span>}
                        </p>
                        <p className="text-gray-600">{a.blurb}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-sm text-gray-600">Wedding website, RSVP, gift registry, invitations, seating chart, guest photo sharing and a thank-you tracker.</p>
                )}
                {bundles.length > 0 && (
                  <p className="mt-6 text-sm text-gray-600">
                    Or save with a bundle: {bundles.map((b) => `${b.name} ${formatUsd(b.price_cents)}`).join(" · ")}.
                  </p>
                )}
              </div>
            </div>
          </Container>
        </section>

        {/* Vendors */}
        <section id="vendors" className="scroll-mt-8 border-t border-gray-100 bg-gray-50 py-20">
          <Container>
            <div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-2">
              <div>
                <h2 className="text-3xl font-medium tracking-tight text-gray-900">For wedding vendors</h2>
                <p className="mt-4 text-gray-600">
                  Get couples who already match your date, area and prices. Your Knotly agent answers them the way you
                  would, using your packages and rules, and brings you in when it matters.
                </p>
                <div className="mt-8">
                  <Button href="/signup?role=vendor" color="gray">
                    Join as a vendor
                  </Button>
                </div>
              </div>
              <ul className="space-y-4 text-sm text-gray-700">
                {[
                  ["Leads that fit", "Only couples whose date is free on your calendar and whose budget fits your packages."],
                  ["An agent that works like you", "Replies, sends estimates and follows up, and asks you before anything outside your rules."],
                  ["Pay your way", "Pay only when a couple opens your estimate, or choose a monthly plan with a public, search-friendly page."],
                ].map(([t, b]) => (
                  <li key={t} className="rounded-xl bg-white p-4 ring-1 ring-gray-100">
                    <p className="font-semibold text-gray-900">{t}</p>
                    <p className="mt-1">{b}</p>
                  </li>
                ))}
              </ul>
            </div>
          </Container>
        </section>

        {/* Final call to action */}
        <section className="py-20">
          <Container>
            <div className="mx-auto max-w-2xl rounded-3xl bg-cyan-500 px-6 py-12 text-center text-white">
              <h2 className="text-3xl font-medium tracking-tight">Ready when you are</h2>
              <p className="mt-3 text-cyan-50">It takes a few minutes, and it&apos;s free.</p>
              <div className="mt-8">
                <Button href="/signup" color="white">
                  Post your wedding
                </Button>
              </div>
            </div>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
