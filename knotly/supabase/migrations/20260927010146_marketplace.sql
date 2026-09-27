create extension if not exists postgis;   -- for distances ("within 50 miles")

-- Cities we serve. Simpler than a geocoding service.
create table metros (
  slug text primary key,
  name text not null,
  state text not null,
  lat double precision not null,
  lng double precision not null
);
insert into metros values
  ('charlotte-nc','Charlotte','NC',35.2271,-80.8431),
  ('raleigh-nc','Raleigh','NC',35.7796,-78.6382),
  ('greenville-sc','Greenville','SC',34.8526,-82.3940);

create table couple_projects (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references profiles on delete cascade,
  partner_names text,
  wedding_date date,
  metro_slug text references metros,
  venue text,
  guest_count int,
  budget_total int,            -- USD
  style text,                  -- "boho, outdoor, golden hour"
  needs text[] default '{}',   -- ['photographer','dj']
  created_at timestamptz default now()
);

create table vendors (
  id uuid primary key references profiles on delete cascade,
  business_name text not null,
  category text not null,
  bio text,
  metro_slug text references metros,
  location geography(point, 4326),
  service_radius_miles int default 50,
  price_min int,
  price_max int,
  website text,
  published boolean not null default false,
  updated_at timestamptz default now()
);

create table vendor_packages (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors on delete cascade,
  name text not null,
  description text,
  price int not null,
  inclusions text[] default '{}'
);

create table testimonials (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors on delete cascade,
  author_name text not null,
  rating int check (rating between 1 and 5),
  body text not null,
  verified boolean not null default false,
  created_at timestamptz default now()
);

-- Security --------------------------------------------------
alter table metros enable row level security;
alter table couple_projects enable row level security;
alter table vendors enable row level security;
alter table vendor_packages enable row level security;
alter table testimonials enable row level security;

-- Public data: anyone (even logged out) can read
create policy "metros public" on metros for select using (true);
create policy "published vendors public" on vendors for select using (published or id = auth.uid());
create policy "packages public" on vendor_packages for select
  using (exists (select 1 from vendors v where v.id = vendor_id and (v.published or v.id = auth.uid())));
create policy "testimonials public" on testimonials for select using (true);

-- Private data: only the owner
create policy "own wedding" on couple_projects for all
  using (couple_id = auth.uid()) with check (couple_id = auth.uid());
create policy "vendor edits own listing" on vendors for all
  using (id = auth.uid()) with check (id = auth.uid());
create policy "vendor edits own packages" on vendor_packages for all
  using (vendor_id = auth.uid()) with check (vendor_id = auth.uid());
create policy "vendor adds unverified reviews" on testimonials for insert
  with check (vendor_id = auth.uid() and verified = false);