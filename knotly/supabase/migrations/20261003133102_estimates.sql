create table quotes (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references threads on delete cascade,
  package_id uuid references vendor_packages,
  line_items jsonb not null,           -- [{"label":"Signature package","amount":4800},{"label":"10% off","amount":-480}]
  total int not null,
  valid_until date not null,           -- estimates expire
  status text not null default 'sent' check (status in ('sent','accepted','declined','expired')),
  first_viewed_at timestamptz,         -- Lesson 17: charged when the couple opens it
  created_at timestamptz default now()
);
alter table quotes enable row level security;
create policy "couple or vendor reads quotes" on quotes for select using (
  owns_thread(thread_id) or exists (select 1 from threads t where t.id = thread_id and t.vendor_id = auth.uid())
);

-- Pay-per-use credits
create table lead_credit_ledger (
  id bigserial primary key,
  vendor_id uuid not null references vendors on delete cascade,
  quote_id uuid references quotes,
  delta int not null,
  reason text not null check (reason in ('welcome','purchase','estimate_viewed','refund','admin_adjust')),
  created_at timestamptz default now(),
  unique (quote_id, reason)
);
alter table lead_credit_ledger enable row level security;
create policy "vendor reads own credits" on lead_credit_ledger for select using (vendor_id = auth.uid());

create function vendor_credit_balance(v uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(delta), 0)::int from lead_credit_ledger where vendor_id = v;
$$;

-- New vendors get 5 free credits (and backfill existing ones)
create function welcome_credits() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into lead_credit_ledger (vendor_id, delta, reason) values (new.id, 5, 'welcome');
  return new;
end $$;
create trigger on_vendor_welcome after insert on vendors for each row execute function welcome_credits();
insert into lead_credit_ledger (vendor_id, delta, reason) select id, 5, 'welcome' from vendors;

-- Escalations: decisions the gate refused, waiting for the human vendor
create table escalations (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references threads on delete cascade,
  vendor_id uuid not null references vendors on delete cascade,
  violations text[] not null,
  reason text not null,                -- human-readable
  decision jsonb not null,             -- the agent's recommended reply
  total int,                           -- priced estimate, if any
  status text not null default 'open' check (status in ('open','reminded','expired','resolved')),
  resolution text check (resolution in ('approved','edited','guided','rejected','taken_over')),
  due_at timestamptz not null,
  resolved_at timestamptz,
  created_at timestamptz default now()
);
alter table escalations enable row level security;
create policy "vendor reads own escalations" on escalations for select using (vendor_id = auth.uid());