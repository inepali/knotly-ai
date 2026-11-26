-- Public listing pages: /wedding-vendors/[city] and /wedding-vendors/[city]/[category].
-- See docs/specs/seo-listing-pages-spec.md.

-- Until when a vendor's public page and listings are on. The billing webhook sets this to the
-- end of the paid period for monthly/yearly plans; pay-per-use vendors leave it null.
-- Only enforced when the server runs with PUBLIC_PAGES_REQUIRE_PLAN=1 (see src/lib/public-listing.ts),
-- so today's behavior (every published vendor is public) holds until billing lands.
alter table vendors add column if not exists listed_until timestamptz;

-- Every published vendor who shows in a city's listings: vendors based in that city, plus vendors
-- elsewhere whose service radius reaches the city's center. One row per (city, vendor).
-- p_metro null = every city (for the sitemap). Called by the server with the service role.
create or replace function list_public_vendors(p_metro text default null, p_require_plan boolean default false)
returns table (
  listing_metro text,
  vendor_id uuid,
  slug text,
  business_name text,
  category text,
  bio text,
  home_metro text,
  service_radius_miles int,
  min_price int,
  updated_at timestamptz
)
language sql stable set search_path = public as $$
  select m.slug, v.id, v.slug, v.business_name, v.category, v.bio, v.metro_slug, v.service_radius_miles,
         (select min(vp.price)::int from vendor_packages vp where vp.vendor_id = v.id),
         v.updated_at
  from metros m
  join vendors v
    on v.published
   and v.slug is not null
   and v.metro_slug is not null
   and (not p_require_plan or v.listed_until > now())
   and (
         v.metro_slug = m.slug
         or (v.location is not null and st_dwithin(
               v.location,
               st_setsrid(st_makepoint(m.lng, m.lat), 4326)::geography,
               coalesce(v.service_radius_miles, 50) * 1609.344
             ))
       )
  where p_metro is null or m.slug = p_metro;
$$;

revoke execute on function list_public_vendors(text, boolean) from public, anon, authenticated;
grant execute on function list_public_vendors(text, boolean) to service_role;
