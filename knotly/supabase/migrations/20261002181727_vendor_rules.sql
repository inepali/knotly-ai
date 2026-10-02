-- How the agent behaves for this vendor
create table vendor_agent_settings (
  vendor_id uuid primary key references vendors on delete cascade,
  autonomy_level int not null default 0 check (autonomy_level between 0 and 3),
  confidence_threshold numeric not null default 0.7,
  hold_days int not null default 3,          -- how long a date hold lasts
  quote_valid_days int not null default 14,  -- estimate expiry
  signature text,
  holding_reply text not null default
    'Thanks so much! I''m reviewing your request personally and will get back to you shortly.'
);

-- Every vendor gets settings automatically
create function create_vendor_settings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into vendor_agent_settings (vendor_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_vendor_created after insert on vendors
  for each row execute function create_vendor_settings();
insert into vendor_agent_settings (vendor_id) select id from vendors on conflict do nothing;

-- The rules: machine-checkable limits
create table vendor_agent_rules (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors on delete cascade,
  kind text not null check (kind in
    ('price_floor','max_discount','capacity_per_day','blackout_weekday','service_radius','always_review')),
  params jsonb not null,
  source_text text,               -- the vendor's own words, for transparency
  active boolean not null default true,
  created_at timestamptz default now()
);

-- Calendar: only dates that are NOT free are stored
create table vendor_availability (
  vendor_id uuid references vendors on delete cascade,
  date date not null,
  status text not null check (status in ('held','booked','blocked')),
  thread_id uuid,
  hold_expires_at timestamptz,
  primary key (vendor_id, date, status, thread_id)
);

alter table vendor_agent_settings enable row level security;
alter table vendor_agent_rules enable row level security;
alter table vendor_availability enable row level security;

-- Only the vendor sees or edits their own agent setup. Couples never see rules.
create policy "own settings" on vendor_agent_settings for all
  using (vendor_id = auth.uid()) with check (vendor_id = auth.uid());
create policy "own rules" on vendor_agent_rules for all
  using (vendor_id = auth.uid()) with check (vendor_id = auth.uid());
create policy "own calendar" on vendor_availability for all
  using (vendor_id = auth.uid()) with check (vendor_id = auth.uid());