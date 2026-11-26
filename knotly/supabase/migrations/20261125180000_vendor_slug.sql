-- A stable, readable URL slug per vendor for the public page, e.g. golden-hour-photography-3f9a1c.
-- The short id suffix keeps it unique and it never changes if the business is renamed, so links
-- and search results stay valid.
alter table vendors add column if not exists slug text;

create or replace function vendor_slug_of(p_name text, p_id uuid) returns text
language sql immutable as $$
  select coalesce(
           nullif(left(trim(both '-' from regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g')), 60), ''),
           'vendor'
         ) || '-' || substr(p_id::text, 1, 6);
$$;

update vendors set slug = vendor_slug_of(business_name, id) where slug is null;
create unique index if not exists vendors_slug_key on vendors (slug);

create or replace function set_vendor_slug() returns trigger
language plpgsql as $$
begin
  if new.slug is null then new.slug := vendor_slug_of(new.business_name, new.id); end if;
  return new;
end;
$$;

drop trigger if exists vendors_set_slug on vendors;
create trigger vendors_set_slug before insert on vendors
  for each row execute function set_vendor_slug();
