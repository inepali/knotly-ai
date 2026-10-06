-- MVP Phase 0 (spec §9 "New tables: couple planning"): checklist, wedding-day timeline,
-- personal calendar events, documents. budget_items already exists (extended earlier).

-- Checklist (CO-2) -------------------------------------------------------------------------
create table checklist_templates (
  id serial primary key,
  title text not null,                         -- 'Book a {{category}}' or a plain task
  months_before numeric not null,              -- negative = after the wedding
  category text references vendor_categories (slug) on update cascade,  -- set: auto-completes when that category is booked
  sort int not null default 0
);

create table checklist_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references couple_projects on delete cascade,
  template_id int references checklist_templates,
  title text not null,
  due_date date,
  category text,
  need_id uuid references needs on delete set null,
  vendor_id uuid references vendors on delete set null,
  status text not null default 'open' check (status in ('open', 'done', 'hidden')),
  snoozed_until date,
  done_at timestamptz,
  created_at timestamptz default now()
);
create index on checklist_items (project_id, due_date);

-- Wedding-day timeline (CO-3) -------------------------------------------------------------
create table timeline_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references couple_projects on delete cascade,
  starts_at time not null,
  duration_min int check (duration_min > 0),
  title text not null,
  location text,
  notes text,
  visibility text not null default 'everyone' check (visibility in ('everyone', 'party', 'couple')),
  sort int not null default 0
);
create index on timeline_events (project_id, starts_at);

create table timeline_assignments (
  event_id uuid references timeline_events on delete cascade,
  vendor_id uuid references vendors on delete cascade,
  primary key (event_id, vendor_id)
);
create index on timeline_assignments (vendor_id);

-- Calendar (CO-4): only personal events are new; the rest is built from existing tables ----
create table personal_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references couple_projects on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz check (ends_at is null or ends_at >= starts_at),
  notes text
);
create index on personal_events (project_id, starts_at);

-- Documents (CO-5): files in the private `documents` bucket, shared per vendor -------------
create table documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references couple_projects on delete cascade,
  uploaded_by uuid references profiles on delete set null,
  storage_path text not null unique,           -- <project_id>/<file>
  name text not null,
  tag text not null default 'other' check (tag in ('contract', 'invoice', 'venue', 'inspiration', 'other')),
  size_bytes int check (size_bytes between 0 and 20971520),   -- 20 MB max
  booking_id uuid references bookings on delete set null,     -- filed automatically (signed contracts)
  created_at timestamptz default now()
);
create index on documents (project_id, created_at desc);

create table document_shares (
  document_id uuid references documents on delete cascade,
  vendor_id uuid references vendors on delete cascade,
  primary key (document_id, vendor_id)
);
create index on document_shares (vendor_id);

-- Helpers for child tables whose parent's policy reads the child (avoids policy recursion).
create function owns_timeline_event(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from timeline_events t join couple_projects p on p.id = t.project_id
                  where t.id = e and p.couple_id = auth.uid());
$$;
create function owns_document(d uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from documents x join couple_projects p on p.id = x.project_id
                  where x.id = d and p.couple_id = auth.uid());
$$;

-- RLS ---------------------------------------------------------------------------------------
alter table checklist_templates enable row level security;
alter table checklist_items enable row level security;
alter table timeline_events enable row level security;
alter table timeline_assignments enable row level security;
alter table personal_events enable row level security;
alter table documents enable row level security;
alter table document_shares enable row level security;

create policy "checklist templates readable" on checklist_templates for select to authenticated using (true);

create policy "couple manages own checklist" on checklist_items for all to authenticated
  using (owns_project(project_id)) with check (owns_project(project_id));

create policy "couple manages own timeline" on timeline_events for all to authenticated
  using (owns_project(project_id)) with check (owns_project(project_id));
create policy "vendor reads assigned timeline events" on timeline_events for select to authenticated
  using (exists (select 1 from timeline_assignments a
                  where a.event_id = timeline_events.id and a.vendor_id = auth.uid()));

-- Couples assign only vendors they have a booking with.
create policy "couple manages own assignments" on timeline_assignments for all to authenticated
  using (owns_timeline_event(event_id))
  with check (
    owns_timeline_event(event_id)
    and exists (select 1 from bookings b join timeline_events t on t.project_id = b.project_id
                 where t.id = event_id and b.vendor_id = timeline_assignments.vendor_id
                   and b.status in ('held', 'contract_sent', 'signed', 'booked', 'completed'))
  );
create policy "vendor reads own assignments" on timeline_assignments for select to authenticated
  using (vendor_id = auth.uid());

create policy "couple manages own personal events" on personal_events for all to authenticated
  using (owns_project(project_id)) with check (owns_project(project_id));

create policy "couple manages own documents" on documents for all to authenticated
  using (owns_project(project_id)) with check (owns_project(project_id));
-- Vendors see the row only; the file itself is served by a server-made signed URL.
create policy "vendor reads shared documents" on documents for select to authenticated
  using (exists (select 1 from document_shares s
                  where s.document_id = documents.id and s.vendor_id = auth.uid()));

create policy "couple manages own shares" on document_shares for all to authenticated
  using (owns_document(document_id)) with check (owns_document(document_id));
create policy "vendor reads own shares" on document_shares for select to authenticated
  using (vendor_id = auth.uid());

-- Checklist templates: ~40 tasks, months before the wedding (CO-2). Rows with a category
-- auto-complete when that category is booked. Timeframes: 12+, 9-12, 6-9, 3-6, 1-3, last
-- month, week of, after.
insert into checklist_templates (title, months_before, category, sort) values
  ('Set your total budget', 14, null, 10),
  ('Draft your guest list estimate', 14, null, 20),
  ('Choose your wedding date', 13, null, 30),
  ('Book a {{category}}', 13, 'wedding_planner', 40),
  ('Book a {{category}}', 12, 'venue', 50),
  ('Book a {{category}}', 11, 'photographer', 60),
  ('Book a {{category}}', 11, 'caterer', 70),
  ('Book a {{category}}', 10, 'videographer', 80),
  ('Book a {{category}}', 10, 'dj', 90),
  ('Book a {{category}}', 10, 'live_band', 95),
  ('Book a {{category}}', 10, 'wedding_officiant', 100),
  ('Start your wedding website', 10, null, 110),
  ('Send save-the-dates', 8, null, 120),
  ('Book a {{category}}', 8, 'florist', 130),
  ('Shop for wedding attire', 9, 'bridal_boutique', 140),
  ('Reserve hotel room blocks for guests', 8, null, 150),
  ('Set up your gift registry', 7, null, 160),
  ('Book a {{category}}', 7, 'hair_stylist', 170),
  ('Book a {{category}}', 7, 'makeup_artist', 180),
  ('Book a {{category}}', 6, 'event_rental', 190),
  ('Book a {{category}}', 6, 'baker', 200),
  ('Book a {{category}}', 5, 'transportation', 210),
  ('Plan the rehearsal dinner', 5, null, 220),
  ('Order invitations', 5, null, 230),
  ('Book a {{category}}', 4, 'tuxedo_rental', 240),
  ('Buy wedding rings', 4, 'jeweler', 250),
  ('Plan your ceremony with your officiant', 3, null, 260),
  ('Schedule attire fittings', 3, 'seamstress', 270),
  ('Send invitations', 2.5, null, 280),
  ('Draft the wedding day timeline', 2, null, 290),
  ('Apply for your marriage license', 1.5, null, 300),
  ('Choose your music: first dance and must-play songs', 1.5, null, 310),
  ('Write your vows', 1, null, 320),
  ('Chase outstanding RSVPs', 1, null, 330),
  ('Send final guest count to your caterer and venue', 0.75, null, 340),
  ('Make the seating chart', 0.75, null, 350),
  ('Confirm timeline and arrival times with every vendor', 0.5, null, 360),
  ('Final dress fitting', 0.5, null, 370),
  ('Pack for the wedding day and honeymoon', 0.25, null, 380),
  ('Prepare vendor tips and final payments in envelopes', 0.25, null, 390),
  ('Send thank-you notes', -1, null, 400),
  ('Leave reviews for your vendors', -1, null, 410),
  ('Change your name (if you''re changing it)', -1.5, null, 420);
