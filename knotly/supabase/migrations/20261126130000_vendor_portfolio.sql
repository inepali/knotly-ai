-- Vendor portfolio: up to 25 photos and 3 video links per vendor, shown on their public page,
-- to couples who got their estimate, and as the cover on listing cards.
-- Keep the limits in sync with src/lib/portfolio.ts. See docs/specs/vendor-portfolio-spec.md.

create table if not exists vendor_portfolio_images (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  storage_path text not null,   -- {vendor_id}/{uuid}.webp, up to 2400px on the long edge
  thumb_path text not null,     -- {vendor_id}/{uuid}-thumb.webp, 600px, for grids and cards
  caption text check (char_length(caption) <= 200),
  sort_order int not null default 0,
  is_cover boolean not null default false,
  width int check (width > 0),
  height int check (height > 0),
  created_at timestamptz not null default now()
);
create index if not exists vendor_portfolio_images_vendor on vendor_portfolio_images (vendor_id, sort_order);
create unique index if not exists one_cover_per_vendor on vendor_portfolio_images (vendor_id) where is_cover;

create table if not exists vendor_portfolio_videos (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  provider text not null check (provider in ('youtube', 'vimeo')),
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{1,32}$'),
  url text not null check (char_length(url) <= 500),
  title text check (char_length(title) <= 120),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (vendor_id, provider, video_id)
);
create index if not exists vendor_portfolio_videos_vendor on vendor_portfolio_videos (vendor_id, sort_order);

-- Limits, enforced here so two uploads at once can't both become #26. The advisory lock makes
-- concurrent inserts for one vendor wait their turn before counting.
create or replace function enforce_portfolio_limit() returns trigger
language plpgsql as $$
declare
  max_rows int := case tg_table_name when 'vendor_portfolio_images' then 25 else 3 end;
  n int;
begin
  perform pg_advisory_xact_lock(hashtext(tg_table_name || new.vendor_id::text));
  execute format('select count(*) from %I where vendor_id = $1', tg_table_name) into n using new.vendor_id;
  if n >= max_rows then
    raise exception 'portfolio_limit:%', max_rows using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists portfolio_images_limit on vendor_portfolio_images;
create trigger portfolio_images_limit before insert on vendor_portfolio_images
  for each row execute function enforce_portfolio_limit();
drop trigger if exists portfolio_videos_limit on vendor_portfolio_videos;
create trigger portfolio_videos_limit before insert on vendor_portfolio_videos
  for each row execute function enforce_portfolio_limit();

-- Security: the vendor writes their own rows. Anyone can read a published vendor's portfolio
-- (same rule as packages); the public page itself decides whether the vendor is public.
alter table vendor_portfolio_images enable row level security;
alter table vendor_portfolio_videos enable row level security;

drop policy if exists "portfolio images read" on vendor_portfolio_images;
drop policy if exists "portfolio images own" on vendor_portfolio_images;
drop policy if exists "portfolio videos read" on vendor_portfolio_videos;
drop policy if exists "portfolio videos own" on vendor_portfolio_videos;

create policy "portfolio images read" on vendor_portfolio_images for select
  using (exists (select 1 from vendors v where v.id = vendor_id and (v.published or v.id = auth.uid())));
create policy "portfolio images own" on vendor_portfolio_images for all to authenticated
  using (vendor_id = auth.uid()) with check (vendor_id = auth.uid());
create policy "portfolio videos read" on vendor_portfolio_videos for select
  using (exists (select 1 from vendors v where v.id = vendor_id and (v.published or v.id = auth.uid())));
create policy "portfolio videos own" on vendor_portfolio_videos for all to authenticated
  using (vendor_id = auth.uid()) with check (vendor_id = auth.uid());

-- Storage: a public bucket, so photos are served from the CDN and search engines can index them.
-- Paths are random UUIDs under the vendor's id; only the vendor can write in their folder.
-- The browser converts every photo to WebP (JPEG where it can't), so only those are accepted.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vendor-portfolio', 'vendor-portfolio', true, 3145728, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "portfolio insert own" on storage.objects;
drop policy if exists "portfolio update own" on storage.objects;
drop policy if exists "portfolio delete own" on storage.objects;

create policy "portfolio insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'vendor-portfolio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "portfolio update own" on storage.objects for update to authenticated
  using (bucket_id = 'vendor-portfolio' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'vendor-portfolio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "portfolio delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'vendor-portfolio' and (storage.foldername(name))[1] = auth.uid()::text);

-- Listing cards show the cover photo: add it to list_public_vendors (return type changes, so recreate).
drop function if exists list_public_vendors(text, boolean);
create function list_public_vendors(p_metro text default null, p_require_plan boolean default false)
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
  updated_at timestamptz,
  cover_thumb_path text
)
language sql stable set search_path = public as $$
  select m.slug, v.id, v.slug, v.business_name, v.category, v.bio, v.metro_slug, v.service_radius_miles,
         (select min(vp.price)::int from vendor_packages vp where vp.vendor_id = v.id),
         v.updated_at,
         (select pi.thumb_path from vendor_portfolio_images pi where pi.vendor_id = v.id
           order by pi.is_cover desc, pi.sort_order, pi.created_at limit 1)
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
