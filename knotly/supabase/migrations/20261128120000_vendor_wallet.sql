-- Pricing model & vendor wallet, step 1: tables, pricing config and wallet functions.
-- Spec: pricing-vendor-wallet-spec.md (Knotly project docs). Extends 20261005130200_billing.sql:
--   - wallet_transactions stays the ledger and wallet_balance() the balance (sum of the ledger).
--   - Estimates opened by couples are still charged in charge_estimate_view(), now from a hold.
-- New: per-metro pricing_config, wallet_holds ($1 set aside when an estimate is sent), signup credit,
-- Stripe reload crediting, admin adjustments, spam-lead credits, the 50 free texts a month.
--
-- Additive except two check constraints on wallet_transactions: the kind list grows, and the
-- old "$10 minimum top-up" goes (reloads are $20 steps now, checked in credit_wallet()).
-- Nothing calls place_estimate_hold() yet: the quotes trigger and the "skip unfunded vendors" match
-- rule are step 3, so the app keeps working unchanged after this migration.
-- Basic/Pro are paused for launch but keep their plan_pricing behaviour (never charged per estimate).

-- Pricing ---------------------------------------------------------------------------------------

-- One default row (metro_slug null) plus optional per-metro overrides. Admin-set.
create table pricing_config (
  id serial primary key,
  metro_slug text unique references metros on delete cascade,
  lead_fee_cents int not null default 100 check (lead_fee_cents >= 0),
  reload_step_cents int not null default 2000 check (reload_step_cents > 0),
  reload_max_steps int not null default 5 check (reload_max_steps between 1 and 20),
  reload_below_cents int not null default 1000 check (reload_below_cents >= 0),
  signup_credit_cents int not null default 1000 check (signup_credit_cents >= 0),
  sms_free_monthly int not null default 50 check (sms_free_monthly >= 0),
  sms_overage_cents int not null default 20 check (sms_overage_cents >= 0),
  updated_at timestamptz not null default now()
);
create unique index pricing_config_one_default on pricing_config ((true)) where metro_slug is null;
insert into pricing_config (metro_slug) values (null);

alter table pricing_config enable row level security;
create policy "pricing config public" on pricing_config for select using (true);
-- No write policies: the admin pricing page writes with the service role.

-- The vendor's metro row if there is one, otherwise the default row.
create function vendor_pricing(p_vendor uuid) returns pricing_config
language sql stable security definer set search_path = public as $$
  select pc.*
    from pricing_config pc
    left join vendors v on v.id = p_vendor
   where pc.metro_slug = v.metro_slug or pc.metro_slug is null
   order by pc.metro_slug is null
   limit 1;
$$;
revoke execute on function vendor_pricing(uuid) from public, anon;
grant execute on function vendor_pricing(uuid) to authenticated, service_role;

-- Ledger --------------------------------------------------------------------------------------

alter table wallet_transactions drop constraint wallet_transactions_kind_check;
alter table wallet_transactions add constraint wallet_transactions_kind_check
  check (kind in ('topup', 'estimate_view', 'sms', 'refund', 'adjust', 'promo', 'lead_credit'));
alter table wallet_transactions drop constraint wallet_transactions_check;  -- the $10 minimum

alter table wallet_transactions
  add column quote_id uuid references quotes on delete set null,   -- lead charges and lead credits
  add column note text check (char_length(note) <= 500),           -- 'signup', admin reason, ...
  add column created_by uuid references profiles on delete set null; -- admin for adjustments/credits

-- Older 'adjust' rows have no note; new ones must.
alter table wallet_transactions add constraint wallet_adjust_needs_note
  check (kind <> 'adjust' or note is not null) not valid;

create unique index wallet_one_signup_credit on wallet_transactions (vendor_id)
  where kind = 'promo' and note = 'signup';
create unique index wallet_one_lead_credit on wallet_transactions (quote_id)
  where kind = 'lead_credit';

-- The fee is fixed when the estimate is sent, so a later price change never alters it.
alter table quotes add column lead_fee_cents int check (lead_fee_cents >= 0);

-- Holds ---------------------------------------------------------------------------------------

-- $1 set aside per sent estimate so a couple never opens an estimate the vendor can't pay for.
-- Captured when the couple opens it, released when it can no longer be opened.
create table wallet_holds (
  quote_id uuid primary key references quotes on delete cascade,
  vendor_id uuid not null references vendors on delete cascade,
  amount_cents int not null check (amount_cents > 0),
  status text not null default 'held' check (status in ('held', 'captured', 'released')),
  release_reason text check (release_reason in ('withdrawn', 'declined', 'closed', 'archived', 'expired', 'admin')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check ((status = 'held') = (resolved_at is null)),
  check ((status = 'released') = (release_reason is not null))
);
create index on wallet_holds (vendor_id) where status = 'held';

alter table wallet_holds enable row level security;
create policy "vendor reads own holds" on wallet_holds for select to authenticated
  using (vendor_id = auth.uid());

-- Security invoker like wallet_balance(): RLS limits a vendor to their own numbers.
create function wallet_held(v uuid) returns int
language sql stable set search_path = public as $$
  select coalesce(sum(amount_cents), 0)::int from wallet_holds where vendor_id = v and status = 'held';
$$;

create function wallet_available(v uuid) returns int
language sql stable set search_path = public as $$
  select wallet_balance(v) - wallet_held(v);
$$;

-- Reload is allowed only below the threshold (default $10).
create function can_reload(v uuid) returns boolean
language sql stable set search_path = public as $$
  select wallet_balance(v) < (vendor_pricing(v)).reload_below_cents;
$$;

revoke execute on function wallet_held(uuid) from public, anon;
revoke execute on function wallet_available(uuid) from public, anon;
revoke execute on function can_reload(uuid) from public, anon;
grant execute on function wallet_held(uuid), wallet_available(uuid), can_reload(uuid)
  to authenticated, service_role;

-- Every money movement for one vendor takes this lock, so leads and texts can't overspend together.
create function lock_wallet(v uuid) returns void
language sql set search_path = public as $$
  select pg_advisory_xact_lock(hashtext('wallet:' || v::text));
$$;
revoke execute on function lock_wallet(uuid) from public, anon, authenticated;

-- Set aside the lead fee for a just-sent estimate. Returns false (and holds nothing) when the
-- vendor's available balance can't cover it. Subscription plans and free fees need no hold.
-- Idempotent. Server-only; the quotes trigger that calls it arrives in step 3.
create function place_estimate_hold(p_quote uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_vendor uuid;
  v_plan text;
  v_opened timestamptz;
  v_fee int;
begin
  select t.vendor_id, v.plan, q.first_viewed_at into v_vendor, v_plan, v_opened
    from quotes q join threads t on t.id = q.thread_id join vendors v on v.id = t.vendor_id
   where q.id = p_quote;
  if v_vendor is null then
    raise exception 'quote not found';
  end if;
  if v_plan <> 'payg' or v_opened is not null then
    return true;
  end if;

  perform lock_wallet(v_vendor);
  if exists (select 1 from wallet_holds where quote_id = p_quote) then
    return true;
  end if;

  v_fee := (vendor_pricing(v_vendor)).lead_fee_cents;
  update quotes set lead_fee_cents = v_fee where id = p_quote;
  if v_fee = 0 then
    return true;
  end if;
  if wallet_available(v_vendor) < v_fee then
    return false;
  end if;
  insert into wallet_holds (quote_id, vendor_id, amount_cents) values (p_quote, v_vendor, v_fee);
  return true;
end $$;
revoke execute on function place_estimate_hold(uuid) from public, anon, authenticated;
grant execute on function place_estimate_hold(uuid) to service_role;

-- Give a hold back when the estimate can no longer be opened. Returns whether one was released.
create function release_estimate_hold(p_quote uuid, p_reason text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_vendor uuid;
begin
  select vendor_id into v_vendor from wallet_holds where quote_id = p_quote;
  if v_vendor is null then
    return false;
  end if;
  perform lock_wallet(v_vendor);
  update wallet_holds set status = 'released', release_reason = p_reason, resolved_at = now()
   where quote_id = p_quote and status = 'held';
  return found;
end $$;
revoke execute on function release_estimate_hold(uuid, text) from public, anon, authenticated;
grant execute on function release_estimate_hold(uuid, text) to service_role;

-- Nightly: release holds on estimates that were declined or expired, or sat unopened 30 days.
create function release_stale_holds() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select h.quote_id,
           case when q.status = 'declined' then 'declined' else 'expired' end as reason
      from wallet_holds h join quotes q on q.id = h.quote_id
     where h.status = 'held'
       and (q.status in ('declined', 'expired')
            or q.valid_until < current_date
            or h.created_at < now() - interval '30 days')
  loop
    if release_estimate_hold(r.quote_id, r.reason) then
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function release_stale_holds() from public, anon, authenticated;
grant execute on function release_stale_holds() to service_role;

-- Lead charge ------------------------------------------------------------------------------------

-- Replaces the Phase 0 version. Charge for the first open of an estimate (idempotent).
-- Pay as you go: the hold becomes the charge. An estimate without an active hold (sent before
-- holds, or released) is charged only if the available balance covers it, so a balance never goes
-- negative. Subscriptions are never charged per estimate. Couples go through view_quote().
create or replace function charge_estimate_view(p_quote uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_vendor uuid;
  v_plan text;
  v_price int;
  v_hold wallet_holds;
  v_usage bigint;
begin
  select t.vendor_id, v.plan into v_vendor, v_plan
    from quotes q join threads t on t.id = q.thread_id join vendors v on v.id = t.vendor_id
   where q.id = p_quote;
  if v_vendor is null then
    raise exception 'quote not found';
  end if;

  update quotes set first_viewed_at = now() where id = p_quote and first_viewed_at is null;
  perform lock_wallet(v_vendor);

  select * into v_hold from wallet_holds where quote_id = p_quote;
  if v_plan <> 'payg' then
    v_price := 0;
  elsif v_hold.status = 'held' then
    v_price := v_hold.amount_cents;
  elsif v_hold.status = 'captured' then
    return;                                    -- already charged
  else
    v_price := coalesce((select lead_fee_cents from quotes where id = p_quote),
                        (vendor_pricing(v_vendor)).lead_fee_cents);
    if wallet_available(v_vendor) < v_price then
      v_price := 0;                            -- no hold and no funds: this lead is free
    end if;
  end if;

  insert into vendor_usage (vendor_id, kind, ref_id, amount_cents)
  values (v_vendor, 'estimate_view', p_quote::text, v_price)
  on conflict (kind, ref_id) do nothing
  returning id into v_usage;
  if v_usage is null then
    return;                                    -- already recorded
  end if;

  if v_price > 0 then
    insert into wallet_transactions (vendor_id, kind, amount_cents, usage_id, quote_id)
    values (v_vendor, 'estimate_view', -v_price, v_usage, p_quote);
  end if;
  if v_hold.status = 'held' then
    update wallet_holds set status = 'captured', resolved_at = now() where quote_id = p_quote;
  end if;
end $$;
revoke execute on function charge_estimate_view(uuid) from public, anon, authenticated;

-- SMS -------------------------------------------------------------------------------------------

-- Replaces the Phase 0 version. Call BEFORE sending a text.
-- Basic/Pro (paused): unchanged, included allowance then plan_pricing.sms_cents, invoiced.
-- Pay as you go: sms_free_monthly free texts a month (50), then sms_overage_cents from the wallet.
-- Returns the amount charged, or -1 when the wallet can't cover it: nothing is recorded and the
-- caller sends by email / in-app instead. Recording the same text twice returns 0.
create or replace function record_sms_usage(p_vendor uuid, p_outbox_id bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
  v_included int;
  v_cents int;
  v_used int;
  v_amount int;
  v_usage bigint;
  v_price pricing_config;
begin
  select v.plan, pp.sms_included, pp.sms_cents into v_plan, v_included, v_cents
    from vendors v join plan_pricing pp on pp.plan = v.plan
   where v.id = p_vendor;
  if v_plan is null then
    raise exception 'vendor not found';
  end if;
  if v_plan = 'payg' then
    v_price := vendor_pricing(p_vendor);
    v_included := v_price.sms_free_monthly;
    v_cents := v_price.sms_overage_cents;
  end if;

  perform lock_wallet(p_vendor);
  if exists (select 1 from vendor_usage where kind = 'sms' and ref_id = p_outbox_id::text) then
    return 0;                                  -- already recorded
  end if;
  select count(*) into v_used from vendor_usage
   where vendor_id = p_vendor and kind = 'sms' and period = date_trunc('month', now())::date;
  v_amount := case when v_used < v_included then 0 else coalesce(v_cents, 0) end;

  if v_plan = 'payg' and v_amount > 0 and wallet_available(p_vendor) < v_amount then
    return -1;                                 -- not sent as a text; nothing recorded
  end if;

  insert into vendor_usage (vendor_id, kind, ref_id, amount_cents)
  values (p_vendor, 'sms', p_outbox_id::text, v_amount)
  on conflict (kind, ref_id) do nothing
  returning id into v_usage;
  if v_usage is null then
    return 0;
  end if;
  if v_plan = 'payg' and v_amount > 0 then
    insert into wallet_transactions (vendor_id, kind, amount_cents, usage_id)
    values (p_vendor, 'sms', -v_amount, v_usage);
  end if;
  return v_amount;
end $$;
revoke execute on function record_sms_usage(uuid, bigint) from public, anon, authenticated;

-- Signup credit ------------------------------------------------------------------------------------

-- One claim per vendor, per phone number and per business (name + metro), so throwaway
-- accounts can't farm the credit. A repeat may still sign up, just without the credit.
create table signup_credit_claims (
  vendor_id uuid primary key references vendors on delete cascade,
  phone_key text not null unique,
  business_key text not null unique,
  created_at timestamptz not null default now()
);
alter table signup_credit_claims enable row level security;
-- No policies: server-only.

-- After phone verification. Returns the credit granted (0 when not eligible).
create function grant_signup_credit(p_vendor uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_verified boolean;
  v_phone text;
  v_business text;
  v_amount int;
begin
  select p.phone_verified,
         nullif(regexp_replace(coalesce(p.phone, v.phone, ''), '[^0-9]', '', 'g'), ''),
         coalesce(slugify(v.business_name), '') || ':' || coalesce(v.metro_slug, '')
    into v_verified, v_phone, v_business
    from vendors v join profiles p on p.id = v.id
   where v.id = p_vendor;
  if not found then
    raise exception 'vendor not found';
  end if;
  if not v_verified or v_phone is null then
    return 0;
  end if;
  v_amount := (vendor_pricing(p_vendor)).signup_credit_cents;
  if v_amount = 0 then
    return 0;
  end if;

  perform lock_wallet(p_vendor);
  insert into signup_credit_claims (vendor_id, phone_key, business_key)
  values (p_vendor, v_phone, v_business)
  on conflict do nothing;
  if not found then
    return 0;
  end if;
  insert into wallet_transactions (vendor_id, kind, amount_cents, note)
  values (p_vendor, 'promo', v_amount, 'signup');
  return v_amount;
end $$;
revoke execute on function grant_signup_credit(uuid) from public, anon, authenticated;
grant execute on function grant_signup_credit(uuid) to service_role;

-- Reloads and adjustments ---------------------------------------------------------------------------

-- Stripe webhook (checkout.session.completed, metadata.type = wallet_reload). Credits the pre-tax
-- amount. Always credits a paid session (the vendor already paid), even if the balance rose in
-- another tab; the threshold is checked when a checkout starts. Idempotent on the session id.
create function credit_wallet(p_vendor uuid, p_cents int, p_session text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_price pricing_config := vendor_pricing(p_vendor);
begin
  if not exists (select 1 from vendors where id = p_vendor) then
    raise exception 'vendor not found';
  end if;
  if p_session is null or p_cents is null or p_cents <= 0
     or p_cents % v_price.reload_step_cents <> 0
     or p_cents > v_price.reload_step_cents * v_price.reload_max_steps then
    raise exception 'invalid reload amount %', p_cents;
  end if;
  perform lock_wallet(p_vendor);
  insert into wallet_transactions (vendor_id, kind, amount_cents, stripe_ref)
  values (p_vendor, 'topup', p_cents, p_session)
  on conflict (stripe_ref) do nothing;
  return found;                                -- false = already credited
end $$;
revoke execute on function credit_wallet(uuid, int, text) from public, anon, authenticated;
grant execute on function credit_wallet(uuid, int, text) to service_role;

create function assert_admin(p_admin uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = p_admin and role = 'admin') then
    raise exception 'not an admin' using errcode = '42501';
  end if;
end $$;
revoke execute on function assert_admin(uuid) from public, anon, authenticated;

-- Admin credit (+) or debit (-), with a reason. A debit can't take the available balance below 0.
create function admin_adjust_wallet(p_vendor uuid, p_cents int, p_note text, p_admin uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_admin(p_admin);
  if p_cents is null or p_cents = 0 or nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'an amount and a note are required';
  end if;
  perform lock_wallet(p_vendor);
  if p_cents < 0 and wallet_available(p_vendor) < -p_cents then
    raise exception 'debit is more than the available balance';
  end if;
  insert into wallet_transactions (vendor_id, kind, amount_cents, note, created_by)
  values (p_vendor, 'adjust', p_cents, trim(p_note), p_admin);
end $$;
revoke execute on function admin_adjust_wallet(uuid, int, text, uuid) from public, anon, authenticated;
grant execute on function admin_adjust_wallet(uuid, int, text, uuid) to service_role;

-- Spam leads --------------------------------------------------------------------------------------

create table lead_spam_reports (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references quotes on delete cascade,
  vendor_id uuid not null references vendors on delete cascade,
  reason text not null check (reason in ('fake_couple', 'fake_details', 'solicitation', 'other')),
  details text check (char_length(details) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references profiles on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on lead_spam_reports (status, created_at);
alter table lead_spam_reports enable row level security;
create policy "vendor reads own spam reports" on lead_spam_reports for select to authenticated
  using (vendor_id = auth.uid());
-- Writes only through report_spam_lead() and resolve_spam_report().

-- Give back what a lead cost. Once per estimate. Returns the amount credited (0 if nothing to give).
create function credit_lead_charge(p_quote uuid, p_by uuid, p_note text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_vendor uuid;
  v_amount int;
begin
  select vendor_id, amount_cents into v_vendor, v_amount
    from vendor_usage where kind = 'estimate_view' and ref_id = p_quote::text;
  if v_vendor is null or v_amount <= 0 then
    return 0;
  end if;
  perform lock_wallet(v_vendor);
  insert into wallet_transactions (vendor_id, kind, amount_cents, quote_id, note, created_by)
  values (v_vendor, 'lead_credit', v_amount, p_quote, p_note, p_by)
  on conflict (quote_id) where kind = 'lead_credit' do nothing;
  return case when found then v_amount else 0 end;
end $$;
revoke execute on function credit_lead_charge(uuid, uuid, text) from public, anon, authenticated;

-- Vendor: report a charged lead as spam, within 14 days of the charge.
-- Paused after more than 5 rejected reports in 30 days.
create function report_spam_lead(p_quote uuid, p_reason text, p_details text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_charged_at timestamptz;
  v_id uuid;
begin
  if v_me is null or not exists (
    select 1 from quotes q join threads t on t.id = q.thread_id where q.id = p_quote and t.vendor_id = v_me
  ) then
    raise exception 'not your estimate' using errcode = '42501';
  end if;
  select created_at into v_charged_at from vendor_usage
   where kind = 'estimate_view' and ref_id = p_quote::text and amount_cents > 0;
  if v_charged_at is null or v_charged_at < now() - interval '14 days' then
    raise exception 'this lead can no longer be reported';
  end if;
  if (select count(*) from lead_spam_reports
       where vendor_id = v_me and status = 'rejected' and reviewed_at > now() - interval '30 days') > 5 then
    raise exception 'spam reporting is paused for 30 days';
  end if;
  insert into lead_spam_reports (quote_id, vendor_id, reason, details)
  values (p_quote, v_me, p_reason, nullif(trim(coalesce(p_details, '')), ''))
  on conflict (quote_id) do nothing
  returning id into v_id;
  if v_id is null then
    raise exception 'already reported';
  end if;
  return v_id;
end $$;
revoke execute on function report_spam_lead(uuid, text, text) from public, anon;
grant execute on function report_spam_lead(uuid, text, text) to authenticated;

-- Admin queue. Approving credits the lead back. Returns the amount credited.
create function resolve_spam_report(p_report uuid, p_approve boolean, p_admin uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_quote uuid;
begin
  perform assert_admin(p_admin);
  update lead_spam_reports
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = p_admin, reviewed_at = now()
   where id = p_report and status = 'pending'
  returning quote_id into v_quote;
  if v_quote is null then
    raise exception 'report not found or already resolved';
  end if;
  if not p_approve then
    return 0;
  end if;
  return credit_lead_charge(v_quote, p_admin, 'spam report');
end $$;
revoke execute on function resolve_spam_report(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function resolve_spam_report(uuid, boolean, uuid) to service_role;

-- Admin ban flow: a couple confirmed as spam. Credits every vendor charged for opening their
-- estimates and approves any pending reports on them. Returns how many leads were credited.
create function credit_spam_couple(p_couple uuid, p_admin uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  perform assert_admin(p_admin);
  for r in
    select q.id from quotes q
      join threads t on t.id = q.thread_id
      join couple_projects cp on cp.id = t.project_id
     where cp.couple_id = p_couple
  loop
    if credit_lead_charge(r.id, p_admin, 'spam couple') > 0 then
      n := n + 1;
    end if;
  end loop;
  update lead_spam_reports s set status = 'approved', reviewed_by = p_admin, reviewed_at = now()
    from quotes q join threads t on t.id = q.thread_id join couple_projects cp on cp.id = t.project_id
   where s.quote_id = q.id and cp.couple_id = p_couple and s.status = 'pending';
  return n;
end $$;
revoke execute on function credit_spam_couple(uuid, uuid) from public, anon, authenticated;
grant execute on function credit_spam_couple(uuid, uuid) to service_role;
