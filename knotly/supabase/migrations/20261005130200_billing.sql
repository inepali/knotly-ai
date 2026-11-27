-- MVP Phase 0 (spec §9 "Vendor plans and usage", "Stripe billing and the Pay-as-you-go wallet").
-- Knotly bills vendors only; nothing here touches couple <-> vendor payments.
-- lead_credit_ledger / vendor_credit_balance() stay (frozen) until the agent moves to the wallet.

create table plan_pricing (
  plan text primary key check (plan in ('basic', 'pro', 'payg')),
  monthly_price_cents int,                    -- subscriptions are never charged per estimate
  sms_included int not null default 0,
  estimate_view_cents int not null default 0, -- charged when a couple opens an estimate
  sms_cents int                               -- per SMS beyond the allowance
);
insert into plan_pricing values
  ('basic', 1900, 200, 0, 20),                -- $19/month, 200 texts, then $0.20 each this month
  ('pro',   4900, 500, 0, 20),                -- $49/month, 500 texts, then $0.20 each this month
  ('payg',  0,    0,   100, 20);              -- $1 per estimate opened, $0.20 per SMS

-- Every billable event, priced when it happens. ref_id is text (spec said uuid) because it
-- holds either a quote id (uuid) or an outbox id (bigint).
create table vendor_usage (
  id bigserial primary key,
  vendor_id uuid not null references vendors on delete cascade,
  kind text not null check (kind in ('estimate_view', 'sms')),
  ref_id text,
  amount_cents int not null default 0,        -- 0 when included in the plan
  period date not null default date_trunc('month', now())::date,
  created_at timestamptz default now(),
  unique (kind, ref_id)                       -- never charge the same estimate or text twice
);
create index on vendor_usage (vendor_id, period);

-- Pay-as-you-go wallet: top-ups add, estimate views and texts subtract.
create table wallet_transactions (
  id bigserial primary key,
  vendor_id uuid not null references vendors on delete cascade,
  kind text not null check (kind in ('topup', 'estimate_view', 'sms', 'refund', 'adjust')),
  amount_cents int not null,                   -- + for top-ups, - for usage
  stripe_ref text unique,                      -- checkout session / payment intent id for top-ups
  usage_id bigint references vendor_usage,
  created_at timestamptz default now(),
  check (kind <> 'topup' or amount_cents >= 1000)   -- minimum top-up $10
);
create index on wallet_transactions (vendor_id, created_at);

alter table plan_pricing enable row level security;
alter table vendor_usage enable row level security;
alter table wallet_transactions enable row level security;

create policy "pricing public" on plan_pricing for select using (true);
create policy "vendor reads own usage" on vendor_usage for select to authenticated
  using (vendor_id = auth.uid());
create policy "vendor reads own wallet" on wallet_transactions for select to authenticated
  using (vendor_id = auth.uid());
-- No write policies: Stripe webhooks and charges run on the server.

-- Security invoker (spec said definer): RLS limits a vendor to their own balance, and the
-- server's service role sees all. Avoids the S-4 problem of a balance anyone can query.
create function wallet_balance(v uuid) returns int
language sql stable set search_path = public as $$
  select coalesce(sum(amount_cents), 0)::int from wallet_transactions where vendor_id = v;
$$;

-- Charge for the first open of an estimate (idempotent). Server-only; couples go through view_quote().
create function charge_estimate_view(p_quote uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_vendor uuid;
  v_price int;
  v_usage bigint;
begin
  select t.vendor_id into v_vendor
    from quotes q join threads t on t.id = q.thread_id
   where q.id = p_quote;
  if v_vendor is null then
    raise exception 'quote not found';
  end if;

  update quotes set first_viewed_at = now() where id = p_quote and first_viewed_at is null;

  select pp.estimate_view_cents into v_price
    from vendors v join plan_pricing pp on pp.plan = v.plan
   where v.id = v_vendor;

  insert into vendor_usage (vendor_id, kind, ref_id, amount_cents)
  values (v_vendor, 'estimate_view', p_quote::text, coalesce(v_price, 0))
  on conflict (kind, ref_id) do nothing
  returning id into v_usage;

  if v_usage is not null and coalesce(v_price, 0) > 0 then
    insert into wallet_transactions (vendor_id, kind, amount_cents, usage_id)
    values (v_vendor, 'estimate_view', -v_price, v_usage);
  end if;
end $$;
revoke execute on function charge_estimate_view from public, anon, authenticated;

-- S-2: the way couples open an estimate. Charges the vendor once (first open by the couple)
-- and returns the full row. The thread's vendor gets the row without a charge.
create function view_quote(p_quote uuid) returns setof quotes
language plpgsql security definer set search_path = public as $$
declare
  v_thread uuid;
begin
  select thread_id into v_thread from quotes where id = p_quote;
  if v_thread is null then
    return;
  end if;
  if owns_thread(v_thread) then
    perform charge_estimate_view(p_quote);
  elsif not exists (select 1 from threads where id = v_thread and vendor_id = auth.uid()) then
    return;
  end if;
  return query select * from quotes where id = p_quote;
end $$;
revoke execute on function view_quote from public, anon;
grant execute on function view_quote to authenticated;

-- Record one sent text against the vendor's plan (called by the outbox sender after a send).
-- Basic/Pro: free within the monthly allowance, then sms_cents each (invoiced with the month).
-- Pay as you go: sms_cents each, deducted from the wallet. Returns the amount charged.
create function record_sms_usage(p_vendor uuid, p_outbox_id bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
  v_included int;
  v_cents int;
  v_used int;
  v_amount int;
  v_usage bigint;
begin
  select v.plan, pp.sms_included, pp.sms_cents into v_plan, v_included, v_cents
    from vendors v join plan_pricing pp on pp.plan = v.plan
   where v.id = p_vendor;
  if v_plan is null then
    raise exception 'vendor not found';
  end if;

  perform pg_advisory_xact_lock(hashtext('sms_usage:' || p_vendor::text));
  select count(*) into v_used from vendor_usage
   where vendor_id = p_vendor and kind = 'sms' and period = date_trunc('month', now())::date;
  v_amount := case when v_used < v_included then 0 else coalesce(v_cents, 0) end;

  insert into vendor_usage (vendor_id, kind, ref_id, amount_cents)
  values (p_vendor, 'sms', p_outbox_id::text, v_amount)
  on conflict (kind, ref_id) do nothing
  returning id into v_usage;

  if v_usage is null then
    return 0;                                  -- already recorded
  end if;
  if v_plan = 'payg' and v_amount > 0 then
    insert into wallet_transactions (vendor_id, kind, amount_cents, usage_id)
    values (p_vendor, 'sms', -v_amount, v_usage);
  end if;
  return v_amount;
end $$;
revoke execute on function record_sms_usage from public, anon, authenticated;
