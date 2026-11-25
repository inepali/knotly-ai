-- Shared fixtures + helpers for the RLS tests. supabase/tests/run.sh runs
--   begin; <this file>; <one *.test.sql>; rollback;
-- against the linked DEV project, so nothing here is ever committed.
-- Tests are pgTAP xUnit functions (tap_tests.test_*) run by runtests(); each runs in its own
-- savepoint, so writes inside a test are undone before the next one.

create extension if not exists pgtap with schema extensions;
create schema tap_tests;
grant usage on schema tap_tests to anon, authenticated;

-- Act as a signed-in user (or anon) for the rest of the current test.
create function tap_tests.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

create function tap_tests.login_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
end $$;

create function tap_tests.logout() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Run a statement as the current role; null if it worked, otherwise the SQLSTATE.
create function tap_tests.sqlstate_of(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlstate;
end $$;

-- Row count of a query as the current role.
create function tap_tests.n(p_sql text) returns int language plpgsql as $$
declare v int;
begin
  execute 'select count(*) from (' || p_sql || ') x' into v;
  return v;
end $$;

-- Fixture ids --------------------------------------------------------------------------------
--   couple A ...a1 (project ...b1), couple B ...a2 (project ...b2)
--   vendor V1 ...c1 (payg, package ...d1), vendor V2 ...c2 (basic, package ...d2)
create function tap_tests.id(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-0000000000' || p)::uuid;
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  (tap_tests.id('a1'), 'couple-a@test.invalid', '{"role":"couple"}'),
  (tap_tests.id('a2'), 'couple-b@test.invalid', '{"role":"couple"}'),
  (tap_tests.id('c1'), 'vendor-1@test.invalid', '{"role":"vendor"}'),
  (tap_tests.id('c2'), 'vendor-2@test.invalid', '{"role":"vendor"}');

insert into vendors (id, business_name, category, metro_slug, published, plan) values
  (tap_tests.id('c1'), 'Test Vendor One', 'photographer', 'charlotte-nc', true, 'payg'),
  (tap_tests.id('c2'), 'Test Vendor Two', 'dj', 'charlotte-nc', true, 'basic');

insert into vendor_packages (id, vendor_id, name, price) values
  (tap_tests.id('d1'), tap_tests.id('c1'), 'Signature', 4800),
  (tap_tests.id('d2'), tap_tests.id('c2'), 'Party', 1600);

insert into couple_projects (id, couple_id, partner_names, wedding_date, metro_slug) values
  (tap_tests.id('b1'), tap_tests.id('a1'), 'Priya & Sam', '2027-10-16', 'charlotte-nc'),
  (tap_tests.id('b2'), tap_tests.id('a2'), 'Jo & Lee', '2027-06-05', 'charlotte-nc');

-- Couple A's planning data (one row per couple-owned table)
insert into needs (project_id, category) values (tap_tests.id('b1'), 'photographer');
insert into checklist_items (project_id, title) values (tap_tests.id('b1'), 'Book a photographer');
insert into personal_events (project_id, title, starts_at) values (tap_tests.id('b1'), 'Cake tasting', now());
insert into guests (id, project_id, first_name, last_name, household, plus_one_allowed) values
  (tap_tests.id('e1'), tap_tests.id('b1'), 'Ana', 'Lopez', 'Lopez', true),
  (tap_tests.id('e2'), tap_tests.id('b1'), 'Ben', 'Lopez', 'Lopez', false);
insert into registry_links (project_id, title, url) values (tap_tests.id('b1'), 'Crate', 'https://example.com');
insert into budget_items (project_id, category, label, estimated) values (tap_tests.id('b1'), 'photographer', 'Photos', 4000);
insert into wedding_websites (project_id, slug, published) values (tap_tests.id('b1'), 'tap-priya-and-sam', true);
insert into timeline_events (id, project_id, starts_at, title, visibility) values
  (tap_tests.id('f1'), tap_tests.id('b1'), '16:00', 'Ceremony', 'everyone'),
  (tap_tests.id('f2'), tap_tests.id('b1'), '15:00', 'Couple portraits', 'couple');
insert into documents (id, project_id, storage_path, name) values
  (tap_tests.id('91'), tap_tests.id('b1'), tap_tests.id('b1') || '/venue.pdf', 'venue.pdf'),
  (tap_tests.id('92'), tap_tests.id('b1'), tap_tests.id('b1') || '/budget.pdf', 'budget.pdf');

-- A <-> V1: thread, estimate, held booking, contract, assignment, shared document
insert into threads (id, project_id, vendor_id) values (tap_tests.id('71'), tap_tests.id('b1'), tap_tests.id('c1'));
insert into quotes (id, thread_id, package_id, line_items, total, valid_until) values
  (tap_tests.id('81'), tap_tests.id('71'), tap_tests.id('d1'), '[{"label":"Signature","amount":4800}]', 4800, '2027-01-01');
insert into bookings (id, project_id, vendor_id, package_id, thread_id, event_date, price, status) values
  (tap_tests.id('61'), tap_tests.id('b1'), tap_tests.id('c1'), tap_tests.id('d1'), tap_tests.id('71'), '2027-10-16', 4800, 'held');
insert into contracts (booking_id, body_rendered) values (tap_tests.id('61'), 'Contract body');
insert into timeline_assignments (event_id, vendor_id) values (tap_tests.id('f1'), tap_tests.id('c1'));
insert into document_shares (document_id, vendor_id) values (tap_tests.id('91'), tap_tests.id('c1'));
insert into activity_events (vendor_id, project_id, booking_id, actor, type, summary, couple_visible) values
  (tap_tests.id('c1'), tap_tests.id('b1'), tap_tests.id('61'), 'agent', 'booking.held', 'Date held', true),
  (tap_tests.id('c1'), tap_tests.id('b1'), tap_tests.id('61'), 'agent', 'gate.checked', 'Rules passed', false);
insert into outbox (to_profile, channel, template, payload) values
  (tap_tests.id('a1'), 'email', 'hold_confirmed', '{}'),
  (tap_tests.id('c1'), 'email', 'vendor_new_request', '{}');

-- V1's own setup
insert into contract_templates (vendor_id, body) values (tap_tests.id('c1'), 'Body {{couple_names}}');
insert into message_templates (vendor_id, event, channel, body) values (tap_tests.id('c1'), 'hold_confirmed', 'email', 'Mine');
insert into vendor_tasks (vendor_id, title) values (tap_tests.id('c1'), 'Call Priya & Sam back');
insert into wallet_transactions (vendor_id, kind, amount_cents, stripe_ref) values (tap_tests.id('c1'), 'topup', 1000, 'tap_test_topup');
insert into vendor_usage (vendor_id, kind, ref_id, amount_cents) values (tap_tests.id('c1'), 'sms', 'tap-1', 0);
