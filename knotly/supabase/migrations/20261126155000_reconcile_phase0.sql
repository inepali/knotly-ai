-- Reconcile Phase 0 (PR #3) with the couple add-ons.
--
-- Phase 0's first version of 20261005130400 created a flat `guests` table, `wedding_websites`,
-- `registry_links` and public RSVP/website functions. The add-ons replace them (guest_households +
-- guests, wedding_sites, RSVP tables, the registry). On a database that already ran that old
-- version (knotly-dev), drop those objects here so the add-on migrations that follow can create
-- theirs. Everything is conditional, so this is a no-op on fresh databases and on databases that
-- already have the add-on tables. Only Phase 0 test/seed data lives in these tables.

drop function if exists submit_rsvp;
drop function if exists find_rsvp;
drop function if exists public_website;
drop function if exists set_website_password;

drop table if exists wedding_websites;

do $$
begin
  -- Phase 0's guests had a free-text `household` column; the add-on's has `household_id`.
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'guests' and column_name = 'household')
     and not exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'guests' and column_name = 'household_id') then
    drop table guests;
  end if;
  -- Phase 0's registry_links had `kind`/`title`; the add-on's has `store`.
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'registry_links' and column_name = 'kind')
     and not exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'registry_links' and column_name = 'store') then
    drop table registry_links;
  end if;
end $$;

-- Phase 0 and 20261125180000 both put a slug trigger on vendors; keep the newer one only.
drop trigger if exists set_vendor_slug on vendors;
