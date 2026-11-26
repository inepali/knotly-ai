# SEO Listing Pages Spec

## Overview

Couples search Google for terms like **"wedding photographers charlotte nc"**, not for a vendor's name. This spec adds **city and category + city listing pages** that target those searches. Each page lists public vendors and sends couples into the form-first flow (**Get free estimates**).

The listing pages sit above the existing vendor pages at `/wedding-vendors/[city]/[category]/[slug]`. Listings rank for the search term and link down to vendors. Vendor pages link back up through breadcrumbs, so each strengthens the other.

Only **public vendors** appear: published, and (once billing ships) on a monthly/yearly plan. Pay-per-use vendors get no public page and no listing.

## Routes

The URLs follow the existing vendor-page hierarchy, so each listing is the breadcrumb parent of the vendor pages under it.

| Page | Route | Example |
|---|---|---|
| All cities | `/wedding-vendors` | `/wedding-vendors` |
| City (all categories) | `/wedding-vendors/[city]` | `/wedding-vendors/charlotte-nc` |
| Category + city (main) | `/wedding-vendors/[city]/[category]` | `/wedding-vendors/charlotte-nc/photographer` |
| Vendor (existing) | `/wedding-vendors/[city]/[category]/[slug]` | `/wedding-vendors/charlotte-nc/photographer/golden-hour-3f9a1c` |

- `[city]` must be a `metros.slug` and `[category]` a real category (`categoryFromParam`). Anything else returns 404.
- A category written with an underscore (`hair_stylist`) 301-redirects to the hyphenated form (`hair-stylist`).
- Headings and titles use search wording ("Wedding Photographers in Charlotte, NC") from `listingNoun()`, even though the URL uses the short category name.

## Who is public

One rule, used by the vendor page, the listings and the sitemap:

- `vendors.listed_until timestamptz`: until when the vendor is public. The billing webhook sets it to the end of the paid period for monthly/yearly plans. Pay-per-use vendors leave it null.
- `PUBLIC_PAGES_REQUIRE_PLAN=1` (server env) turns the plan check on. **It's off by default**, so every published vendor stays public until billing ships. Then flip the env var.
- In code: `isPublicVendor()` in `src/lib/public-listing.ts` and the `p_require_plan` argument of `list_public_vendors()`.

## Data

- Migration `20261126120000_public_listings.sql`:
  - adds `vendors.listed_until`
  - adds `list_public_vendors(p_metro, p_require_plan)`, which returns one row per (city, vendor) for every public vendor based in the city or whose service radius reaches the city's center (PostGIS, same check as `match_project_vendors`). Each row includes the starting price. Pass `p_metro = null` for every city. Service role only.
- No new metro or category columns are needed: metros already have `slug`, `name`, `state`, `lat`, `lng`.

## Category + city page

Top to bottom:

1. Breadcrumbs: Home › Charlotte, NC › Wedding Photographers
2. H1 "Wedding Photographers in Charlotte, NC", plus an intro with the real vendor count and price range
3. **Get free estimates →** goes to `/signup?role=couple&metro=charlotte-nc&need=photographer`. After signup the couple lands on My Wedding with the city and vendor type filled in (on screen only, saved when they save or post). The button stays sticky at the bottom of the screen on phones.
4. Vendor cards: initial tile (the cover photo comes with the Portfolio), name, starting price, "Based in X, serves Y" for vendors from other cities, and a short bio. Each card links to the vendor page.
5. Price guide (lowest / typical / highest starting price), shown only with ≥ 3 prices
6. FAQ answered with this page's numbers (the price question appears only when there are real numbers)
7. Related links: the same category in up to 5 nearby cities that have vendors, and other categories in this city with counts

**Vendor order:** a daily rotation keyed on the Charlotte date (`dailySeed` + `seededShuffle`). The order holds all day and changes the next day. A vendor joining doesn't reshuffle everyone else. No paid placement.

## City page

H1 "Wedding Vendors in {City}", a description naming the city's biggest categories, the categories that have vendors (grouped like the rest of the app, with counts) linking to the category pages, and nearby cities.

## Indexing (avoid thin content)

| Public vendors on a category page | Behavior |
|---|---|
| ≥ 3 (`MIN_INDEXABLE_VENDORS`) | Indexed, in sitemap, count + year in title |
| 1–2 | Renders, `noindex,follow`, not in sitemap, no price guide |
| 0 | "Be the first to get estimates" message + CTA, `noindex`, not in sitemap |

A city page is indexed when at least one of its category pages is. `/wedding-vendors` is in the sitemap once any city is.

## Structured data & metadata

- Listing pages: `BreadcrumbList` + `ItemList` of vendors (or of category pages, on the city page). No `FAQPage` markup and no ratings on listings.
- Vendor pages: breadcrumbs now go Home › City › Category › Vendor, both on the page and in the JSON-LD.
- Title: `4 Wedding Photographers in Charlotte, NC (2026) | Knotly` when indexable, without the count otherwise. No "Best" claim, since the order is a rotation, not a ranking.
- Canonical URL on every page.

## Sitemap

`/sitemap.xml`: home, `/wedding-vendors`, indexable city pages, indexable category pages (`lastModified` = newest vendor update), and each public vendor page once.

## Rendering

Server-rendered on each request (`dynamic = "force-dynamic"`), like the sitemap, so the daily rotation and plan changes show immediately.

## Not in this pass

- ISR/tag revalidation (read Next 16's caching docs in `node_modules/next/dist/docs/` first; this version's caching APIs differ)
- Open Graph images, a cross-city category page (`/wedding-photographers`), and an admin-written `seo_pages` intro/FAQ table
- "Popular searches" links in the footer and on the landing page
- Showing pay-per-use vendors as a count ("+12 more respond to posts")
- Cover photos on cards (comes with `vendor-portfolio-spec.md`)

## Launch checklist

1. Run the migration (`pnpm migrate`). The vendor page selects `listed_until`, so deploy the code after the migration.
2. Recruit enough Charlotte-area vendors to get the main categories to 3+.
3. Verify the domain in Google Search Console and submit `/sitemap.xml`.
4. When billing ships: have the Stripe webhook set `listed_until`, then set `PUBLIC_PAGES_REQUIRE_PLAN=1`.

## Tests

`src/lib/listing.test.ts`: addresses, a search name for every category, the indexing threshold, Charlotte-date seed, rotation stability, price stats, titles/intro, FAQ, nearby cities, category counts, JSON-LD, and signup prefill sanitizing. `src/lib/vendor-seo.test.ts`: breadcrumbs up through the listing pages.

## References

- `vendor-portfolio-spec.md`: public vs. pay-per-use vendors, cover photos
- `form-first-migration-spec.md`: `match_project_vendors`, signup, My Wedding
