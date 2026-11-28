-- Vendor wallet, step 5: Stripe reloads (pricing-vendor-wallet-spec.md).
--   * credit_wallet() also records the payment intent, so a refund can find its reload.
--   * refund_wallet_payment() takes back a refunded reload's share (pre-tax), never below $0
--     available. Refunds are admin-only (issued in Stripe); vendors can't ask for one.

alter table wallet_transactions add column stripe_intent text;
create index wallet_transactions_intent on wallet_transactions (stripe_intent) where stripe_intent is not null;

-- Same as step 1's, plus p_intent. Signature changes, so drop and recreate (no data in a function).
drop function credit_wallet(uuid, int, text);
create function credit_wallet(p_vendor uuid, p_cents int, p_session text, p_intent text default null)
returns boolean
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
  insert into wallet_transactions (vendor_id, kind, amount_cents, stripe_ref, stripe_intent)
  values (p_vendor, 'topup', p_cents, p_session, p_intent)
  on conflict (stripe_ref) do nothing;
  return found;                                -- false = already credited
end $$;
revoke execute on function credit_wallet(uuid, int, text, text) from public, anon, authenticated;
grant execute on function credit_wallet(uuid, int, text, text) to service_role;

-- charge.refunded for a wallet reload. p_amount / p_refunded are the charge's totals (with tax);
-- the wallet gives back the same share of the pre-tax credit. Cumulative, so repeated or partial
-- refund events never double-debit. Returns cents debited now, or null if p_intent isn't a reload.
create function refund_wallet_payment(p_intent text, p_amount int, p_refunded int) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_vendor uuid;
  v_topup int;
  v_target int;
  v_done int;
  v_debit int;
begin
  select vendor_id, amount_cents into v_vendor, v_topup
    from wallet_transactions where kind = 'topup' and stripe_intent = p_intent;
  if v_vendor is null then
    return null;
  end if;
  perform lock_wallet(v_vendor);
  v_target := least(v_topup, round(v_topup::numeric * greatest(p_refunded, 0) / nullif(p_amount, 0))::int);
  select coalesce(-sum(amount_cents), 0) into v_done
    from wallet_transactions where kind = 'refund' and stripe_intent = p_intent;
  -- Never below $0 available: credit already spent on leads stays spent.
  v_debit := greatest(0, least(coalesce(v_target, 0) - v_done, wallet_available(v_vendor)));
  if v_debit > 0 then
    insert into wallet_transactions (vendor_id, kind, amount_cents, stripe_intent, note)
    values (v_vendor, 'refund', -v_debit, p_intent, 'stripe refund');
  end if;
  return v_debit;
end $$;
revoke execute on function refund_wallet_payment(text, int, int) from public, anon, authenticated;
grant execute on function refund_wallet_payment(text, int, int) to service_role;
