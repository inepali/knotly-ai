-- Vendor wallet, step 3: hold the $1 lead fee when an estimate is sent, and stop asking vendors
-- who can't cover it (pricing-vendor-wallet-spec.md).
--   * vendor_can_take_lead()  Pay as you go needs available >= lead fee; Basic/Pro always can.
--   * quotes trigger           every new estimate places its hold, or the insert fails with KN402.
--   * quotes status trigger    declined / expired estimates give the hold back.
--   * match_project_vendors()  skips vendors who can't take a lead (same rules otherwise).
-- The agent's old credits check (vendor_credit_balance) moves to vendor_can_take_lead() in code.

create function vendor_can_take_lead(v uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from vendors where id = v
       and (plan <> 'payg' or wallet_available(v) >= (vendor_pricing(v)).lead_fee_cents)
  );
$$;
revoke execute on function vendor_can_take_lead(uuid) from public, anon, authenticated;
grant execute on function vendor_can_take_lead(uuid) to service_role;

-- SQLSTATE KN402 = "not enough balance for the lead fee"; the app checks for it.
create function quotes_place_hold() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not place_estimate_hold(new.id) then
    raise exception 'Not enough balance for the lead fee' using errcode = 'KN402';
  end if;
  return null;
end $$;
revoke execute on function quotes_place_hold() from public, anon, authenticated;
create trigger quotes_place_hold after insert on quotes for each row execute function quotes_place_hold();

create function quotes_release_hold() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform release_estimate_hold(new.id, new.status);
  return null;
end $$;
revoke execute on function quotes_release_hold() from public, anon, authenticated;
create trigger quotes_release_hold after update of status on quotes for each row
  when (new.status in ('declined', 'expired') and old.status is distinct from new.status)
  execute function quotes_release_hold();

-- Same as 20261105120000_form_first_posting.sql, plus: the vendor can take a lead.
create or replace function match_project_vendors(p_project uuid, p_category text)
returns table (vendor_id uuid, cheapest_price int)
language sql stable set search_path = public as $$
  with p as (
    select cp.id, cp.wedding_date, m.lat, m.lng,
           coalesce(pn.budget, cp.budget_total) as budget
    from couple_projects cp
    join metros m on m.slug = cp.metro_slug
    left join project_needs pn on pn.project_id = cp.id and pn.category = p_category
    where cp.id = p_project and cp.wedding_date is not null
  )
  select v.id, min(vp.price)::int
  from p
  join vendors v on v.published and v.category = p_category and v.location is not null
  join vendor_packages vp on vp.vendor_id = v.id
  where st_dwithin(
          v.location,
          st_setsrid(st_makepoint(p.lng, p.lat), 4326)::geography,
          coalesce(v.service_radius_miles, 50) * 1609.344
        )
    and not exists (
      select 1 from vendor_availability a
      where a.vendor_id = v.id and a.date = p.wedding_date
        and (a.status in ('booked', 'blocked')
             or (a.status = 'held' and (a.hold_expires_at is null or a.hold_expires_at > now())))
    )
    and not exists (select 1 from threads t where t.project_id = p.id and t.vendor_id = v.id)
    and vendor_can_take_lead(v.id)
  group by v.id, p.budget
  having p.budget is null or min(vp.price) <= p.budget;
$$;
revoke execute on function match_project_vendors(uuid, text) from public, anon, authenticated;
grant execute on function match_project_vendors(uuid, text) to service_role;
