create extension if not exists btree_gist;

-- Weekly call windows, in the vendor's own time zone
create table consult_hours (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors on delete cascade,
  weekday int not null check (weekday between 0 and 6),   -- 0 = Sunday
  start_time time not null,
  end_time time not null check (end_time > start_time),
  timezone text not null default 'America/New_York',
  slot_minutes int not null default 30 check (slot_minutes between 15 and 120)
);

alter table vendor_agent_settings
  add column call_link text,                         -- Zoom / Meet / phone instructions
  add column call_min_notice_hours int not null default 24,
  add column calls_per_day int not null default 4;

create table consultations (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references threads on delete cascade,
  vendor_id uuid not null references vendors on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'booked' check (status in ('booked','cancelled')),
  created_at timestamptz default now(),
  -- The database itself refuses two overlapping booked calls for one vendor
  exclude using gist (vendor_id with =, tstzrange(starts_at, ends_at) with &&) where (status = 'booked')
);

alter table consult_hours enable row level security;
alter table consultations enable row level security;
create policy "vendor manages call hours" on consult_hours for all
  using (vendor_id = auth.uid()) with check (vendor_id = auth.uid());
create policy "couple or vendor sees calls" on consultations for select
  using (owns_thread(thread_id) or vendor_id = auth.uid());
-- No insert policy: only the booking route (server) creates calls