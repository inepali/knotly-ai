-- Vendor wallet, step 8: admin pricing page (pricing-vendor-wallet-spec.md).
--   * pricing_config.updated_by: who last changed a row (updated_at already says when).
--   * credit_wallet() no longer checks the paid amount against the CURRENT step/max: an admin may
--     change them while a vendor is in Checkout, and a paid reload must still be credited (the
--     amount was checked when the session was created, and the webhook is signature-verified).
--     It keeps a $1,000 sanity cap. Same signature as step 5.

alter table pricing_config add column updated_by uuid references profiles on delete set null;

create or replace function credit_wallet(p_vendor uuid, p_cents int, p_session text, p_intent text default null)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from vendors where id = p_vendor) then
    raise exception 'vendor not found';
  end if;
  if p_session is null or p_cents is null or p_cents <= 0 or p_cents > 100000 then
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
