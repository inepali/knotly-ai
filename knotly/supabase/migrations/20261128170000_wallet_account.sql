-- Vendor wallet, step 6: the Account page and low-balance alerts (pricing-vendor-wallet-spec.md).
--   * wallet_summary()          the signed-in vendor's balance card, reload rules and SMS this month
--   * wallet_activity(...)      their ledger, newest first, filtered and paged, with the couple's
--                               first name + wedding month on lead rows (nothing else about them)
--   * take_wallet_alert(v)      'low' (< reload threshold, $10) or 'empty' (< lead fee, $1) when an
--                               alert is due; at most one of each kind per 24 hours. The app emails it.

create function wallet_summary()
returns table (balance_cents int, held_cents int, available_cents int, lead_fee_cents int,
               reload_below_cents int, reload_step_cents int, reload_max_steps int, can_reload boolean,
               plan text, sms_free_monthly int, sms_used_this_month int, sms_spent_this_month_cents int)
language sql stable security definer set search_path = public as $$
  with me as (select v.id, v.plan, vendor_pricing(v.id) as p from vendors v where v.id = auth.uid()),
  sms as (
    select count(*)::int as used, coalesce(sum(u.amount_cents), 0)::int as spent
      from vendor_usage u, me
     where u.vendor_id = me.id and u.kind = 'sms' and u.period = date_trunc('month', now())::date
  )
  select wallet_balance(me.id), wallet_held(me.id), wallet_available(me.id), (me.p).lead_fee_cents,
         (me.p).reload_below_cents, (me.p).reload_step_cents, (me.p).reload_max_steps,
         wallet_balance(me.id) < (me.p).reload_below_cents,
         me.plan, (me.p).sms_free_monthly, sms.used, sms.spent
    from me, sms;
$$;
revoke execute on function wallet_summary() from public, anon;
grant execute on function wallet_summary() to authenticated;

-- p_kind: null = all, or 'leads' | 'reloads' | 'credits' | 'sms'.
create function wallet_activity(p_kind text default null, p_limit int default 25, p_offset int default 0)
returns table (id bigint, kind text, amount_cents int, created_at timestamptz, note text,
               quote_id uuid, thread_id uuid, couple_first_name text, wedding_month text,
               has_receipt boolean, total_count bigint)
language sql stable security definer set search_path = public as $$
  select w.id, w.kind, w.amount_cents, w.created_at,
         case when w.kind in ('adjust', 'lead_credit', 'refund') then w.note end,
         w.quote_id, t.id,
         nullif(split_part(trim(coalesce(cp.partner_names, '')), ' ', 1), ''),
         to_char(cp.wedding_date, 'Mon YYYY'),
         w.kind = 'topup' and w.stripe_intent is not null,
         count(*) over ()
    from wallet_transactions w
    left join quotes q on q.id = w.quote_id
    left join threads t on t.id = q.thread_id
    left join couple_projects cp on cp.id = t.project_id
   where w.vendor_id = auth.uid()
     and (p_kind is null
          or (p_kind = 'leads' and w.kind = 'estimate_view')
          or (p_kind = 'reloads' and w.kind in ('topup', 'refund'))
          or (p_kind = 'credits' and w.kind in ('promo', 'lead_credit', 'adjust'))
          or (p_kind = 'sms' and w.kind = 'sms'))
   order by w.created_at desc, w.id desc
   limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;
revoke execute on function wallet_activity(text, int, int) from public, anon;
grant execute on function wallet_activity(text, int, int) to authenticated;

create table wallet_alerts (
  id bigserial primary key,
  vendor_id uuid not null references vendors on delete cascade,
  kind text not null check (kind in ('low', 'empty')),
  sent_at timestamptz not null default now()
);
create index on wallet_alerts (vendor_id, kind, sent_at desc);
alter table wallet_alerts enable row level security;
-- No policies: server-only.

-- Server-only. Returns the alert to email now, or null. Pay-as-you-go vendors only.
create function take_wallet_alert(v uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
  v_price pricing_config;
  v_available int;
  v_kind text;
begin
  select plan into v_plan from vendors where id = v;
  if v_plan is distinct from 'payg' then
    return null;
  end if;
  perform lock_wallet(v);
  v_price := vendor_pricing(v);
  v_available := wallet_available(v);
  v_kind := case when v_available < v_price.lead_fee_cents then 'empty'
                 when v_available < v_price.reload_below_cents then 'low' end;
  if v_kind is null or exists (
    select 1 from wallet_alerts where vendor_id = v and kind = v_kind and sent_at > now() - interval '24 hours'
  ) then
    return null;
  end if;
  insert into wallet_alerts (vendor_id, kind) values (v, v_kind);
  return v_kind;
end $$;
revoke execute on function take_wallet_alert(uuid) from public, anon, authenticated;
grant execute on function take_wallet_alert(uuid) to service_role;
