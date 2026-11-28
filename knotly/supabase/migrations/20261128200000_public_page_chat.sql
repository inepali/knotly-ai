-- "Talk to {agent name}" on the vendor's public page (vendor-public-agent-chat-spec.md).
--   * Agent identity: the vendor names their assistant; the same name labels Vendor Agent messages.
--   * Public chat: anonymous sessions (claim token in an httpOnly cookie, only its hash stored),
--     their messages, and leads captured by the contact card.
--   * Lead billing: a lead from the page costs the standard lead fee ($1) from the wallet, charged
--     when it's submitted. Under $1 the lead is saved "locked" (contact details hidden) and unlocked,
--     oldest first, once the wallet can pay. Spam marks give the fee back (limited).
--   * One fee per couple-vendor connection: a page lead after an opened estimate is free, and an
--     estimate opened within 30 days of a paid page lead is free.
-- Additive: new columns/tables/functions; two kind checks grow; charge_estimate_view() and
-- wallet_activity() are replaced with the same signatures.

-- Agent identity --------------------------------------------------------------------------------

alter table vendor_agent_settings
  add column agent_display_name text
    check (char_length(agent_display_name) between 2 and 30
           and agent_display_name ~ '^[A-Za-z][A-Za-z '' -]*$'),
  add column public_chat_enabled boolean not null default true;

-- The assistant's name is public (it's on the vendor's page), so anyone may read it.
create function vendor_agent_name(v uuid) returns text
language sql stable security definer set search_path = public as $$
  select nullif(trim(agent_display_name), '') from vendor_agent_settings where vendor_id = v;
$$;
grant execute on function vendor_agent_name(uuid) to anon, authenticated, service_role;

-- Sessions and messages -------------------------------------------------------------------------

create table vendor_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors on delete cascade,
  couple_user_id uuid references profiles on delete set null,  -- signed in, or claimed after signup
  claim_token_hash text,                                         -- sha256 of the cookie token
  claim_expires_at timestamptz,                                  -- 7 days
  thread_id uuid references threads on delete set null,          -- set once moved to Messages
  ip_hash text,
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create index on vendor_chat_sessions (vendor_id, created_at desc);
create index on vendor_chat_sessions (couple_user_id) where couple_user_id is not null;

create table vendor_chat_messages (
  id bigserial primary key,
  session_id uuid not null references vendor_chat_sessions on delete cascade,
  role text not null check (role in ('visitor', 'assistant')),
  body text not null check (char_length(body) <= 4000),
  created_at timestamptz not null default now()
);
create index on vendor_chat_messages (session_id, id);

-- Leads -----------------------------------------------------------------------------------------

create table vendor_leads (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors on delete cascade,
  session_id uuid not null references vendor_chat_sessions on delete cascade,
  couple_user_id uuid references profiles on delete set null,
  name text not null check (char_length(name) between 2 and 80),
  email text not null check (char_length(email) <= 254),
  phone text check (char_length(phone) <= 20),
  wedding_date date,
  need text not null check (char_length(need) between 10 and 1000),
  wants_more_estimates boolean not null default false,
  consent_text text not null,
  consented_at timestamptz not null,
  -- locked: waiting for funds (contact hidden). flagged: looked automated, delivered free and marked unverified.
  status text not null default 'locked'
    check (status in ('locked', 'flagged', 'new', 'contacted', 'converted', 'spam')),
  fee_cents int check (fee_cents >= 0),        -- fixed at submit; 0 = free
  charged_at timestamptz,                      -- when it was paid for (or delivered free)
  wallet_txn_id bigint references wallet_transactions on delete set null,
  created_at timestamptz not null default now()
);
create index on vendor_leads (vendor_id, lower(email), created_at desc);  -- 30-day de-dupe
create index on vendor_leads (vendor_id, created_at) where status = 'locked';

alter table vendor_chat_sessions enable row level security;
alter table vendor_chat_messages enable row level security;
alter table vendor_leads enable row level security;

-- Visitors never touch these tables: the server routes use the service role and the claim token.
-- Couples read their own (claimed or signed-in) chats. Vendors go through vendor_page_leads().
create policy "couple reads own chat sessions" on vendor_chat_sessions for select to authenticated
  using (couple_user_id = auth.uid());
create policy "couple reads own chat messages" on vendor_chat_messages for select to authenticated
  using (exists (select 1 from vendor_chat_sessions s where s.id = session_id and s.couple_user_id = auth.uid()));

-- Wallet ----------------------------------------------------------------------------------------

alter table vendor_usage drop constraint vendor_usage_kind_check;
alter table vendor_usage add constraint vendor_usage_kind_check
  check (kind in ('estimate_view', 'sms', 'page_lead'));

alter table wallet_transactions drop constraint wallet_transactions_kind_check;
alter table wallet_transactions add constraint wallet_transactions_kind_check
  check (kind in ('topup', 'estimate_view', 'sms', 'refund', 'adjust', 'promo', 'lead_credit', 'page_lead'));

alter table wallet_transactions
  add column lead_id uuid references vendor_leads on delete set null;  -- page-lead charges and credits
create unique index wallet_one_page_lead_credit on wallet_transactions (lead_id)
  where kind = 'lead_credit' and lead_id is not null;

-- Has this couple already opened an estimate from this vendor?
create function couple_opened_vendor_estimate(p_couple uuid, p_vendor uuid, p_before timestamptz default now())
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from quotes q
      join threads t on t.id = q.thread_id
      join couple_projects p on p.id = t.project_id
     where t.vendor_id = p_vendor and p.couple_id = p_couple
       and q.first_viewed_at is not null and q.first_viewed_at <= p_before
  );
$$;
revoke execute on function couple_opened_vendor_estimate(uuid, uuid, timestamptz) from public, anon, authenticated;

-- Pay for one locked lead if the wallet can. Returns the lead's status afterwards. Idempotent.
create function charge_page_lead(p_lead uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_vendor uuid;
  l vendor_leads;
  v_plan text;
  v_fee int;
  v_usage bigint;
  v_txn bigint;
begin
  select vendor_id into v_vendor from vendor_leads where id = p_lead;
  if v_vendor is null then
    raise exception 'lead not found';
  end if;
  perform lock_wallet(v_vendor);
  select * into l from vendor_leads where id = p_lead for update;
  if l.status <> 'locked' then
    return l.status;
  end if;

  select plan into v_plan from vendors where id = v_vendor;
  v_fee := coalesce(l.fee_cents, (vendor_pricing(v_vendor)).lead_fee_cents);
  if v_plan <> 'payg' or v_fee = 0 then
    update vendor_leads set status = 'new', fee_cents = 0, charged_at = now() where id = p_lead;
    return 'new';
  end if;
  if wallet_available(v_vendor) < v_fee then
    update vendor_leads set fee_cents = v_fee where id = p_lead;   -- the price is fixed at submit
    return 'locked';
  end if;

  insert into vendor_usage (vendor_id, kind, ref_id, amount_cents)
  values (v_vendor, 'page_lead', p_lead::text, v_fee)
  on conflict (kind, ref_id) do nothing
  returning id into v_usage;
  if v_usage is not null then
    insert into wallet_transactions (vendor_id, kind, amount_cents, usage_id, lead_id, note)
    values (v_vendor, 'page_lead', -v_fee, v_usage, p_lead,
            left('Lead from your page – ' || split_part(trim(l.name), ' ', 1), 500))
    returning id into v_txn;
  end if;
  update vendor_leads
     set status = 'new', fee_cents = v_fee, charged_at = now(), wallet_txn_id = coalesce(v_txn, wallet_txn_id)
   where id = p_lead;
  return 'new';
end $$;
revoke execute on function charge_page_lead(uuid) from public, anon, authenticated;

-- Contact card submit (server only). De-dupes the same email to the same vendor within 30 days.
-- p_flagged: the server's abuse checks think it's automated; delivered free and marked unverified.
create function submit_page_lead(
  p_session uuid, p_name text, p_email text, p_phone text, p_wedding_date date, p_need text,
  p_wants_more boolean, p_consent text, p_flagged boolean, p_couple uuid
) returns table (lead_id uuid, lead_status text, duplicate boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_vendor uuid;
  v_id uuid;
  v_status text;
begin
  select vendor_id into v_vendor from vendor_chat_sessions where id = p_session;
  if v_vendor is null then
    raise exception 'chat not found';
  end if;
  if p_couple is not null then
    update vendor_chat_sessions set couple_user_id = p_couple where id = p_session and couple_user_id is null;
  end if;

  select l.id, l.status into v_id, v_status from vendor_leads l
   where l.vendor_id = v_vendor and lower(l.email) = lower(trim(p_email))
     and l.created_at > now() - interval '30 days'
   order by l.created_at limit 1;
  if v_id is not null then
    return query select v_id, v_status, true;
    return;
  end if;

  insert into vendor_leads (vendor_id, session_id, couple_user_id, name, email, phone, wedding_date, need,
                            wants_more_estimates, consent_text, consented_at, status, fee_cents, charged_at)
  values (v_vendor, p_session, p_couple, trim(p_name), lower(trim(p_email)), nullif(trim(coalesce(p_phone, '')), ''),
          p_wedding_date, trim(p_need), coalesce(p_wants_more, false), p_consent, now(),
          'locked', null, null)
  returning id into v_id;

  if p_flagged then
    update vendor_leads set status = 'flagged', fee_cents = 0, charged_at = now() where id = v_id;
    v_status := 'flagged';
  elsif p_couple is not null and couple_opened_vendor_estimate(p_couple, v_vendor) then
    update vendor_leads set status = 'new', fee_cents = 0, charged_at = now() where id = v_id;
    v_status := 'new';
  else
    v_status := charge_page_lead(v_id);
  end if;
  return query select v_id, v_status, false;
end $$;
revoke execute on function submit_page_lead(uuid, text, text, text, date, text, boolean, text, boolean, uuid)
  from public, anon, authenticated;
grant execute on function submit_page_lead(uuid, text, text, text, date, text, boolean, text, boolean, uuid)
  to service_role;

-- After a reload (or any credit): pay for locked leads, oldest first, while funds last.
create function unlock_page_leads(p_vendor uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in select id from vendor_leads where vendor_id = p_vendor and status = 'locked' order by created_at loop
    exit when charge_page_lead(r.id) = 'locked';
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function unlock_page_leads(uuid) from public, anon, authenticated;
grant execute on function unlock_page_leads(uuid) to service_role;

-- Give back a page lead's fee. Once per lead. Returns the amount credited.
create function credit_page_lead(p_lead uuid, p_note text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_vendor uuid;
  v_amount int;
begin
  select vendor_id, amount_cents into v_vendor, v_amount
    from vendor_usage where kind = 'page_lead' and ref_id = p_lead::text;
  if v_vendor is null or v_amount <= 0 then
    return 0;
  end if;
  perform lock_wallet(v_vendor);
  insert into wallet_transactions (vendor_id, kind, amount_cents, lead_id, note)
  values (v_vendor, 'lead_credit', v_amount, p_lead, p_note)
  on conflict (lead_id) where kind = 'lead_credit' and lead_id is not null do nothing;
  return case when found then v_amount else 0 end;
end $$;
revoke execute on function credit_page_lead(uuid, text) from public, anon, authenticated;

-- Vendor: move a lead along. Marking spam within 14 days of the charge gives the fee back, up to
-- 3 page-lead credits per 30 days (more still marks it spam, without a credit). Returns cents credited.
create function set_page_lead_status(p_lead uuid, p_status text) returns int
language plpgsql security definer set search_path = public as $$
declare
  l vendor_leads;
  v_recent int;
begin
  select * into l from vendor_leads where id = p_lead and vendor_id = auth.uid();
  if l.id is null then
    raise exception 'lead not found' using errcode = '42501';
  end if;
  if p_status not in ('new', 'contacted', 'converted', 'spam') then
    raise exception 'invalid status';
  end if;
  if l.status = 'locked' then
    raise exception 'reload to see this lead first';
  end if;
  update vendor_leads set status = p_status where id = p_lead;
  if p_status <> 'spam' or l.status = 'spam' or coalesce(l.fee_cents, 0) = 0
     or l.charged_at < now() - interval '14 days' then
    return 0;
  end if;
  select count(*) into v_recent from wallet_transactions
   where vendor_id = l.vendor_id and kind = 'lead_credit' and lead_id is not null
     and created_at > now() - interval '30 days';
  if v_recent >= 3 then
    return 0;
  end if;
  return credit_page_lead(p_lead, 'Marked as spam');
end $$;
revoke execute on function set_page_lead_status(uuid, text) from public, anon;
grant execute on function set_page_lead_status(uuid, text) to authenticated;

-- Vendor's Leads list: contact details hidden while a lead is locked.
create function vendor_page_leads(p_limit int default 50)
returns table (id uuid, status text, created_at timestamptz, wedding_date date, need text,
               name text, email text, phone text, fee_cents int, charged_at timestamptz,
               thread_id uuid, couple_signed_up boolean)
language sql stable security definer set search_path = public as $$
  select l.id, l.status, l.created_at, l.wedding_date, l.need,
         case when l.status = 'locked' then null else l.name end,
         case when l.status = 'locked' then null else l.email end,
         case when l.status = 'locked' then null else l.phone end,
         l.fee_cents, l.charged_at, s.thread_id, l.couple_user_id is not null
    from vendor_leads l join vendor_chat_sessions s on s.id = l.session_id
   where l.vendor_id = auth.uid()
   order by l.created_at desc
   limit least(greatest(p_limit, 1), 200);
$$;
revoke execute on function vendor_page_leads(int) from public, anon;
grant execute on function vendor_page_leads(int) to authenticated;

-- The chat behind one lead, for its vendor, once unlocked.
create function vendor_page_lead_transcript(p_lead uuid)
returns table (role text, body text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.role, m.body, m.created_at
    from vendor_leads l join vendor_chat_messages m on m.session_id = l.session_id
   where l.id = p_lead and l.vendor_id = auth.uid() and l.status <> 'locked'
   order by m.id;
$$;
revoke execute on function vendor_page_lead_transcript(uuid) from public, anon;
grant execute on function vendor_page_lead_transcript(uuid) to authenticated;

-- Claim ------------------------------------------------------------------------------------------

-- After a couple signs up or signs in on the device that chatted (the server checked the cookie
-- token): link the chat to them, copy it into a Messages thread with the vendor, and prepare a post
-- if they asked for more estimates. Returns the thread id (null for non-couples). Idempotent.
create function claim_vendor_chat(p_session uuid, p_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s vendor_chat_sessions;
  v vendors;
  v_role text;
  v_project uuid;
  v_thread uuid;
  v_agent text;
  v_transcript text;
  l record;
begin
  select * into s from vendor_chat_sessions where id = p_session for update;
  if s.id is null then
    raise exception 'chat not found';
  end if;
  if s.couple_user_id is not null and s.couple_user_id <> p_user then
    raise exception 'chat belongs to someone else' using errcode = '42501';
  end if;
  if s.thread_id is not null then
    return s.thread_id;
  end if;
  select role into v_role from profiles where id = p_user;
  if v_role is distinct from 'couple' then
    return null;
  end if;
  select * into v from vendors where id = s.vendor_id;

  select id into v_project from couple_projects where couple_id = p_user order by created_at limit 1;
  if v_project is null then
    insert into couple_projects (couple_id) values (p_user) returning id into v_project;
  end if;

  insert into threads (project_id, vendor_id, origin) values (v_project, v.id, 'inquiry')
  on conflict (project_id, vendor_id) do nothing;
  select id into v_thread from threads where project_id = v_project and vendor_id = v.id;

  v_agent := coalesce(vendor_agent_name(v.id), v.business_name);
  select string_agg(case when m.role = 'visitor' then 'You: ' else v_agent || ': ' end || m.body, E'\n\n' order by m.id)
    into v_transcript
    from vendor_chat_messages m where m.session_id = p_session;
  if v_transcript is not null then
    insert into messages (thread_id, sender, subject, body, payload)
    values (v_thread, 'system', 'Your chat on ' || v.business_name || '''s page', left(v_transcript, 20000),
            jsonb_build_object('type', 'public_chat_transcript', 'session_id', p_session));
  end if;

  update vendor_chat_sessions
     set couple_user_id = p_user, thread_id = v_thread, claim_token_hash = null, claim_expires_at = null
   where id = p_session;
  update vendor_leads set couple_user_id = p_user where session_id = p_session and couple_user_id is null;

  for l in select * from vendor_leads where session_id = p_session loop
    -- One fee per connection: they'd already opened this vendor's estimate before the lead.
    if coalesce(l.fee_cents, 0) > 0 and couple_opened_vendor_estimate(p_user, v.id, l.created_at) then
      perform credit_page_lead(l.id, 'Already connected on Knotly');
    end if;
    -- "Also get free estimates from other …": set up the post; the couple taps Post on My Wedding.
    -- This vendor now has a thread on the project, so matching skips them.
    if l.wants_more_estimates then
      insert into project_needs (project_id, category) values (v_project, v.category)
      on conflict do nothing;
      update couple_projects
         set metro_slug = coalesce(metro_slug, v.metro_slug),
             wedding_date = coalesce(wedding_date, l.wedding_date)
       where id = v_project;
    end if;
  end loop;
  return v_thread;
end $$;
revoke execute on function claim_vendor_chat(uuid, uuid) from public, anon, authenticated;
grant execute on function claim_vendor_chat(uuid, uuid) to service_role;

-- Nightly: chats nobody claimed and that never became a lead go after 30 days.
create function purge_stale_vendor_chats() returns int
language sql security definer set search_path = public as $$
  with gone as (
    delete from vendor_chat_sessions s
     where s.couple_user_id is null and s.last_message_at < now() - interval '30 days'
       and not exists (select 1 from vendor_leads l where l.session_id = s.id)
    returning 1
  )
  select count(*)::int from gone;
$$;
revoke execute on function purge_stale_vendor_chats() from public, anon, authenticated;
grant execute on function purge_stale_vendor_chats() to service_role;

-- Estimate opens ---------------------------------------------------------------------------------

-- Same as 20261128120000, plus: free when this couple's page lead to this vendor was paid for in
-- the last 30 days (one fee per connection).
create or replace function charge_estimate_view(p_quote uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_vendor uuid;
  v_plan text;
  v_couple uuid;
  v_price int;
  v_hold wallet_holds;
  v_usage bigint;
begin
  select t.vendor_id, v.plan, p.couple_id into v_vendor, v_plan, v_couple
    from quotes q join threads t on t.id = q.thread_id join vendors v on v.id = t.vendor_id
    join couple_projects p on p.id = t.project_id
   where q.id = p_quote;
  if v_vendor is null then
    raise exception 'quote not found';
  end if;

  update quotes set first_viewed_at = now() where id = p_quote and first_viewed_at is null;
  perform lock_wallet(v_vendor);

  select * into v_hold from wallet_holds where quote_id = p_quote;
  if v_plan <> 'payg' then
    v_price := 0;
  elsif v_hold.status = 'captured' then
    return;                                    -- already charged
  elsif exists (select 1 from vendor_leads l
                 where l.vendor_id = v_vendor and l.couple_user_id = v_couple
                   and l.fee_cents > 0 and l.charged_at > now() - interval '30 days'
                   and not exists (select 1 from wallet_transactions c
                                    where c.kind = 'lead_credit' and c.lead_id = l.id)) then
    v_price := 0;                              -- they already paid for this couple's page lead
  elsif v_hold.status = 'held' then
    v_price := v_hold.amount_cents;
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

-- Account activity --------------------------------------------------------------------------------

-- Same as 20261128180000, with page leads listed under "leads" and their note shown.
create or replace function wallet_activity(p_kind text default null, p_limit int default 25, p_offset int default 0)
returns table (id bigint, kind text, amount_cents int, created_at timestamptz, note text,
               quote_id uuid, thread_id uuid, couple_first_name text, wedding_month text,
               has_receipt boolean, total_count bigint, can_report boolean, report_status text)
language sql stable security definer set search_path = public as $$
  select w.id, w.kind, w.amount_cents, w.created_at,
         case when w.kind in ('adjust', 'lead_credit', 'refund', 'page_lead') then w.note end,
         w.quote_id, t.id,
         coalesce(nullif(split_part(trim(coalesce(cp.partner_names, '')), ' ', 1), ''),
                  nullif(split_part(trim(coalesce(vl.name, '')), ' ', 1), '')),
         coalesce(to_char(cp.wedding_date, 'Mon YYYY'), to_char(vl.wedding_date, 'Mon YYYY')),
         w.kind = 'topup' and w.stripe_intent is not null,
         count(*) over (),
         -- Same window as report_spam_lead(): a charged lead, within 14 days, not reported or credited.
         -- Page leads are reported from the Leads list instead.
         w.kind = 'estimate_view' and w.amount_cents < 0 and s.id is null
           and w.created_at > now() - interval '14 days'
           and not exists (select 1 from wallet_transactions c where c.kind = 'lead_credit' and c.quote_id = w.quote_id),
         s.status
    from wallet_transactions w
    left join quotes q on q.id = w.quote_id
    left join threads t on t.id = q.thread_id
    left join couple_projects cp on cp.id = t.project_id
    left join vendor_leads vl on vl.id = w.lead_id and vl.status <> 'locked'
    left join lead_spam_reports s on s.quote_id = w.quote_id and w.kind = 'estimate_view'
   where w.vendor_id = auth.uid()
     and (p_kind is null
          or (p_kind = 'leads' and w.kind in ('estimate_view', 'page_lead'))
          or (p_kind = 'reloads' and w.kind in ('topup', 'refund'))
          or (p_kind = 'credits' and w.kind in ('promo', 'lead_credit', 'adjust'))
          or (p_kind = 'sms' and w.kind = 'sms'))
   order by w.created_at desc, w.id desc
   limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;
