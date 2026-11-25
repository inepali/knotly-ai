-- MVP Phase 0 (spec §9 "New tables: bookings and the agent").
-- RLS: couple-owned rows use owns_project(); vendor-owned rows use vendor_id = auth.uid();
-- bookings and contracts are read by both parties and written only by server code
-- (transitionBooking, the outbox sender) with the admin client after ownership checks.

-- Needs: what the couple still has to book (replaces couple_projects.needs[]) --------------
create table needs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references couple_projects on delete cascade,
  category text not null references vendor_categories (slug) on update cascade,
  budget int check (budget >= 0),
  priority int not null default 2 check (priority between 1 and 3),
  must_haves text[] not null default '{}',
  notes text,
  status text not null default 'not_started'
    check (status in ('not_started', 'requested', 'offer_received', 'booked')),
  booking_id uuid,
  created_at timestamptz default now()
);
create index on needs (project_id);

-- Bookings: one couple + one vendor + one package for one date ------------------------------
create table bookings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references couple_projects on delete cascade,
  vendor_id uuid not null references vendors,
  package_id uuid not null references vendor_packages,
  need_id uuid references needs on delete set null,
  thread_id uuid references threads,
  event_date date not null,
  start_time time,
  hours numeric,
  venue text,
  guest_count int,
  note text,                                   -- couple's optional free text (untrusted in prompts)
  price int not null check (price >= 0),       -- copied from the package at request time
  retainer_amount int,                         -- copied from the package for the contract
  status text not null default 'requested' check (status in
    ('requested', 'needs_vendor', 'held', 'declined', 'expired', 'contract_sent',
     'signed', 'booked', 'completed', 'cancelled')),
  hold_expires_at timestamptz,
  contract_due_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index one_open_booking on bookings (project_id, vendor_id)
  where status not in ('declined', 'expired', 'cancelled', 'completed');
create index on bookings (vendor_id, status);
create index on bookings (project_id);
create index bookings_hold_expiry on bookings (hold_expires_at) where status = 'held';

create function touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger bookings_touch before update on bookings
  for each row execute function touch_updated_at();

alter table needs add constraint needs_booking_id_fkey
  foreign key (booking_id) references bookings on delete set null;
alter table threads add constraint threads_booking_id_fkey
  foreign key (booking_id) references bookings on delete set null;
alter table testimonials add constraint testimonials_booking_id_fkey
  foreign key (booking_id) references bookings on delete set null;
alter table quotes add constraint quotes_booking_id_fkey
  foreign key (booking_id) references bookings on delete set null;
alter table budget_items add constraint budget_items_booking_id_fkey
  foreign key (booking_id) references bookings on delete set null;
alter table vendor_availability add constraint vendor_availability_booking_id_fkey
  foreign key (booking_id) references bookings on delete cascade;

-- Contracts (VW-6) --------------------------------------------------------------------------
-- No default body is seeded: contract text needs a lawyer's review (GAP Q-12).
create table contract_templates (
  vendor_id uuid primary key references vendors on delete cascade,
  body text not null,                          -- markdown with {{merge_fields}}
  cancellation_policy text,                    -- {{cancellation_policy}}
  custom_terms text,                           -- {{custom_terms}}
  updated_at timestamptz default now()
);
create trigger contract_templates_touch before update on contract_templates
  for each row execute function touch_updated_at();

create table contracts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings on delete cascade,
  body_rendered text not null,                 -- frozen copy at send time
  pdf_path text,                               -- in the private `contracts` bucket
  couple_signed_name text,
  couple_signed_at timestamptz,
  couple_signed_ip inet,
  vendor_signed_at timestamptz,
  status text not null default 'sent' check (status in ('sent', 'signed', 'countersigned', 'void')),
  created_at timestamptz default now()
);
create index on contracts (booking_id);

-- Message templates: vendor_id null = Knotly default; a vendor row overrides it ------------
-- (The spec's primary key included vendor_id, which can't be null; a surrogate id plus a
-- nulls-not-distinct unique key allows the defaults.)
create table message_templates (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendors on delete cascade,
  event text not null,                         -- hold_confirmed, date_unavailable, followup_1, ...
  channel text not null check (channel in ('email', 'sms')),
  subject text,
  body text not null,
  updated_at timestamptz default now(),
  unique nulls not distinct (vendor_id, event, channel)
);

-- Activity feed: one human line per thing that happened ----------------------------------
create table activity_events (
  id bigserial primary key,
  vendor_id uuid references vendors on delete cascade,
  project_id uuid references couple_projects on delete cascade,
  booking_id uuid references bookings on delete cascade,
  thread_id uuid references threads on delete cascade,
  actor text not null check (actor in ('agent', 'vendor', 'couple', 'system')),
  type text not null,                          -- booking.held, kb.answered, call.booked, sms.sent, ...
  summary text not null,
  payload jsonb,
  couple_visible boolean not null default false,  -- couple-facing types only (set by the writer)
  created_at timestamptz default now()
);
create index on activity_events (vendor_id, created_at desc);
create index on activity_events (project_id, created_at desc);
create index on activity_events (booking_id);

-- Outbox: every email/SMS goes through here (quiet hours, retries, cancellable reminders) ---
create table outbox (
  id bigserial primary key,
  to_profile uuid not null references profiles on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  template text not null,
  payload jsonb not null,
  send_after timestamptz not null default now(),
  cancel_key text,                             -- e.g. 'followup:<booking_id>', cancelled when the couple replies
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'cancelled')),
  attempts int not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz default now()
);
create index on outbox (status, send_after);
create index outbox_cancel_key on outbox (cancel_key) where status = 'queued';

-- Vendor tasks: "Call Priya & Sam back" ----------------------------------------------------
create table vendor_tasks (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors on delete cascade,
  booking_id uuid references bookings on delete cascade,
  title text not null,
  due_at timestamptz,
  done_at timestamptz,
  created_at timestamptz default now()
);
create index on vendor_tasks (vendor_id, done_at);

-- RLS ---------------------------------------------------------------------------------------
alter table needs enable row level security;
alter table bookings enable row level security;
alter table contract_templates enable row level security;
alter table contracts enable row level security;
alter table message_templates enable row level security;
alter table activity_events enable row level security;
alter table outbox enable row level security;
alter table vendor_tasks enable row level security;

create policy "couple manages own needs" on needs for all to authenticated
  using (owns_project(project_id)) with check (owns_project(project_id));

-- Both parties read; status moves happen in server code only.
create policy "couple or vendor reads booking" on bookings for select to authenticated
  using (vendor_id = auth.uid() or owns_project(project_id));

create policy "vendor manages own contract template" on contract_templates for all to authenticated
  using (vendor_id = auth.uid()) with check (vendor_id = auth.uid());

create policy "couple or vendor reads contract" on contracts for select to authenticated
  using (exists (select 1 from bookings b
                  where b.id = contracts.booking_id
                    and (b.vendor_id = auth.uid() or owns_project(b.project_id))));

create policy "vendor reads own and default templates" on message_templates for select to authenticated
  using (vendor_id = auth.uid() or vendor_id is null);
create policy "vendor adds own templates" on message_templates for insert to authenticated
  with check (vendor_id = auth.uid());
create policy "vendor edits own templates" on message_templates for update to authenticated
  using (vendor_id = auth.uid()) with check (vendor_id = auth.uid());
create policy "vendor removes own templates" on message_templates for delete to authenticated
  using (vendor_id = auth.uid());

create policy "vendor reads own activity" on activity_events for select to authenticated
  using (vendor_id = auth.uid());
create policy "couple reads own couple-facing activity" on activity_events for select to authenticated
  using (couple_visible and owns_project(project_id));

create policy "read own outbox rows" on outbox for select to authenticated
  using (to_profile = auth.uid());

create policy "vendor manages own tasks" on vendor_tasks for all to authenticated
  using (vendor_id = auth.uid()) with check (vendor_id = auth.uid());

-- Backfill needs from couple_projects.needs[] (array stays, read-only, until the UI moves) ---
insert into needs (project_id, category, budget, status)
select p.id, n.category,
       (select b.estimated from budget_items b
         where b.project_id = p.id and b.category = n.category and b.label is null
         limit 1),
       'not_started'
  from couple_projects p
 cross join lateral (select distinct x as category from unnest(p.needs) x) n
 where exists (select 1 from vendor_categories c where c.slug = n.category)
   and not exists (select 1 from needs e where e.project_id = p.id and e.category = n.category);
