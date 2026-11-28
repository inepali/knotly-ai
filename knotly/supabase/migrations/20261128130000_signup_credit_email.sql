-- Vendor wallet, step 2: the $10 signup credit also unlocks with a verified EMAIL (the code sent at
-- sign-up). Phone verification (Twilio) comes later and still works. One credit per vendor, per
-- verified phone, per verified email (Gmail dots and +tags ignored) and per business (name + metro).

alter table signup_credit_claims alter column phone_key drop not null;
alter table signup_credit_claims add column email_key text unique;
alter table signup_credit_claims add constraint signup_credit_claims_has_key
  check (phone_key is not null or email_key is not null);

-- jane.doe+knotly@GoogleMail.com -> janedoe@gmail.com; other domains just drop the +tag.
create function normalize_email(e text) returns text
language sql immutable set search_path = public as $$
  with p as (
    select split_part(lower(trim(e)), '@', 1) as local, split_part(lower(trim(e)), '@', 2) as domain
  ), q as (
    select split_part(local, '+', 1) as local,
           case when domain = 'googlemail.com' then 'gmail.com' else domain end as domain
      from p
  )
  select case when e is null or position('@' in e) = 0 or local = '' or domain = '' then null
              when domain = 'gmail.com' then replace(local, '.', '') || '@' || domain
              else local || '@' || domain end
    from q;
$$;

-- Replaces step 1's version: eligible with a verified phone or a confirmed email.
create or replace function grant_signup_credit(p_vendor uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_phone text;
  v_email text;
  v_business text;
  v_amount int;
begin
  select case when p.phone_verified
              then nullif(regexp_replace(coalesce(p.phone, v.phone, ''), '[^0-9]', '', 'g'), '') end,
         case when u.email_confirmed_at is not null then normalize_email(u.email) end,
         coalesce(slugify(v.business_name), '') || ':' || coalesce(v.metro_slug, '')
    into v_phone, v_email, v_business
    from vendors v
    join profiles p on p.id = v.id
    left join auth.users u on u.id = v.id
   where v.id = p_vendor;
  if not found then
    raise exception 'vendor not found';
  end if;
  if v_phone is null and v_email is null then
    return 0;                                  -- nothing verified yet
  end if;
  v_amount := (vendor_pricing(p_vendor)).signup_credit_cents;
  if v_amount = 0 then
    return 0;
  end if;

  perform lock_wallet(p_vendor);
  insert into signup_credit_claims (vendor_id, phone_key, email_key, business_key)
  values (p_vendor, v_phone, v_email, v_business)
  on conflict do nothing;
  if not found then
    return 0;                                  -- this vendor, phone, email or business already claimed
  end if;
  insert into wallet_transactions (vendor_id, kind, amount_cents, note)
  values (p_vendor, 'promo', v_amount, 'signup');
  return v_amount;
end $$;
revoke execute on function grant_signup_credit(uuid) from public, anon, authenticated;
grant execute on function grant_signup_credit(uuid) to service_role;
