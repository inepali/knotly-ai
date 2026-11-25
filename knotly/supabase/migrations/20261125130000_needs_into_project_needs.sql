-- Fold Phase 0's `needs` table into form-first's `project_needs` (one table per need).
-- Phase 0 (20261005130100) added `needs` with a uuid id; form-first (20261105120000) added
-- `project_needs` keyed by (project_id, category), which posting and matching already use.
-- `project_needs` stays the one table: it gains the Phase 0 columns, `needs` rows are copied in,
-- and the `need_id` links are dropped (bookings reach the need through vendor category,
-- checklist items through their own `category` column).

-- 1. Phase 0 columns on project_needs ---------------------------------------------------------
alter table project_needs
  add column priority   int not null default 2 check (priority between 1 and 3),
  add column must_haves text[] not null default '{}',
  add column notes      text,
  add column status     text not null default 'not_started'
    check (status in ('not_started', 'requested', 'offer_received', 'booked')),
  add column booking_id uuid references bookings on delete set null,
  add column created_at timestamptz not null default now();

-- 2. Copy needs rows in (a budget already set on project_needs wins) -----------------------------
insert into project_needs (project_id, category, budget, priority, must_haves, notes, status, booking_id, created_at)
select project_id, category, budget, priority, must_haves, notes, status, booking_id, coalesce(created_at, now())
  from needs
on conflict (project_id, category) do update
   set budget     = coalesce(project_needs.budget, excluded.budget),
       priority   = excluded.priority,
       must_haves = excluded.must_haves,
       notes      = excluded.notes,
       status     = excluded.status,
       booking_id = excluded.booking_id,
       created_at = least(project_needs.created_at, excluded.created_at);

-- 3. Drop the uuid links, then the table ---------------------------------------------------------
alter table bookings drop column need_id;
alter table checklist_items drop column need_id;
drop table needs;

-- 4. Help cap: form-first's help_quota_usage + take_help_quota (20261115120000) is what
--    /api/help uses (signed-in users and IP hashes). Phase 0's per-profile copy is unused.
drop function take_help_message();
drop table help_usage;
