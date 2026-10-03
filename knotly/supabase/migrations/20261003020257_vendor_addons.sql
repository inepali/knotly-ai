-- Add-ons: optional extras a vendor sells on top of a package (second shooter, extra
-- hour, album). Shown to couples as cards, and the only add-ons an estimate may use.
create table vendor_addons (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors on delete cascade,
  name text not null,
  description text,
  price int not null check (price >= 0),  -- whole USD
  created_at timestamptz not null default now()
);
create index on vendor_addons (vendor_id);

alter table vendor_addons enable row level security;

-- Same visibility as packages: anyone can see a published vendor's add-ons; vendors see and edit their own.
create policy "addons public" on vendor_addons for select
  using (exists (select 1 from vendors v where v.id = vendor_addons.vendor_id and (v.published or v.id = auth.uid())));
create policy "vendor edits own addons" on vendor_addons for all
  using (vendor_id = auth.uid()) with check (vendor_id = auth.uid());
