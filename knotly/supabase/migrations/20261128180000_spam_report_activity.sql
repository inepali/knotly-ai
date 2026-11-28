-- Vendor wallet, step 7: spam reports in the Account activity (pricing-vendor-wallet-spec.md).
-- wallet_activity() gains can_report (the lead can still be reported: charged, within 14 days,
-- not reported or credited yet) and report_status (pending / approved / rejected).
-- The return type changes, so drop and recreate (a function holds no data).

drop function wallet_activity(text, int, int);

-- p_kind: null = all, or 'leads' | 'reloads' | 'credits' | 'sms'.
create function wallet_activity(p_kind text default null, p_limit int default 25, p_offset int default 0)
returns table (id bigint, kind text, amount_cents int, created_at timestamptz, note text,
               quote_id uuid, thread_id uuid, couple_first_name text, wedding_month text,
               has_receipt boolean, total_count bigint, can_report boolean, report_status text)
language sql stable security definer set search_path = public as $$
  select w.id, w.kind, w.amount_cents, w.created_at,
         case when w.kind in ('adjust', 'lead_credit', 'refund') then w.note end,
         w.quote_id, t.id,
         nullif(split_part(trim(coalesce(cp.partner_names, '')), ' ', 1), ''),
         to_char(cp.wedding_date, 'Mon YYYY'),
         w.kind = 'topup' and w.stripe_intent is not null,
         count(*) over (),
         -- Same window as report_spam_lead(): a charged lead, within 14 days, not reported or credited.
         w.kind = 'estimate_view' and w.amount_cents < 0 and s.id is null
           and w.created_at > now() - interval '14 days'
           and not exists (select 1 from wallet_transactions c where c.kind = 'lead_credit' and c.quote_id = w.quote_id),
         s.status
    from wallet_transactions w
    left join quotes q on q.id = w.quote_id
    left join threads t on t.id = q.thread_id
    left join couple_projects cp on cp.id = t.project_id
    left join lead_spam_reports s on s.quote_id = w.quote_id and w.kind = 'estimate_view'
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

