-- Couple-owned tables: owns_project(project_id). Couple A sees and writes only their own
-- rows; couple B, vendors and anon see nothing and can't write into A's project.

create function tap_tests.couple_tables() returns text[] language sql as $$
  select array['project_needs', 'checklist_items', 'personal_events', 'guest_households', 'wedding_events',
               'registry_links', 'budget_items', 'wedding_sites', 'timeline_events', 'documents'];
$$;

create function tap_tests.test_couple_reads_own() returns setof text language plpgsql as $$
declare t text; v int;
begin
  foreach t in array tap_tests.couple_tables() loop
    perform tap_tests.login(tap_tests.id('a1'));
    v := tap_tests.n(format('select 1 from %I where project_id = %L', t, tap_tests.id('b1')));
    perform tap_tests.logout();
    return next ok(v > 0, format('couple A reads own %s', t));
  end loop;
end $$;

create function tap_tests.test_others_read_nothing() returns setof text language plpgsql as $$
declare t text; who text; v int;
begin
  foreach t in array tap_tests.couple_tables() loop
    foreach who in array array['a2', 'c2', 'anon'] loop
      if who = 'anon' then perform tap_tests.login_anon();
      else perform tap_tests.login(tap_tests.id(who)); end if;
      v := tap_tests.n(format('select 1 from %I where project_id = %L', t, tap_tests.id('b1')));
      perform tap_tests.logout();
      return next is(v, 0, format('%s cannot read couple A''s %s', who, t));
    end loop;
  end loop;
end $$;

-- V1 has a booking with A but still can't read A's private planning (except assigned
-- timeline events and shared documents, tested in 030).
create function tap_tests.test_booked_vendor_reads_no_private_planning() returns setof text language plpgsql as $$
declare t text; v int;
begin
  foreach t in array array['project_needs', 'checklist_items', 'personal_events', 'guest_households',
                           'wedding_events', 'registry_links', 'budget_items', 'wedding_sites'] loop
    perform tap_tests.login(tap_tests.id('c1'));
    v := tap_tests.n(format('select 1 from %I where project_id = %L', t, tap_tests.id('b1')));
    perform tap_tests.logout();
    return next is(v, 0, format('booked vendor V1 cannot read couple A''s %s', t));
  end loop;
end $$;

create function tap_tests.test_couple_b_cannot_write_into_a() returns setof text language plpgsql as $$
declare st text;
begin
  perform tap_tests.login(tap_tests.id('a2'));
  st := tap_tests.sqlstate_of(format(
    'insert into project_needs (project_id, category) values (%L, ''dj'')', tap_tests.id('b1')));
  perform tap_tests.logout();
  return next is(st, '42501', 'couple B cannot add a need to A''s project');

  perform tap_tests.login(tap_tests.id('a2'));
  st := tap_tests.sqlstate_of(format(
    'insert into guests (household_id, first_name) values (%L, ''Eve'')', tap_tests.id('e0')));
  perform tap_tests.logout();
  return next is(st, '42501', 'couple B cannot add a guest to A''s list');

  perform tap_tests.login(tap_tests.id('a2'));
  perform tap_tests.sqlstate_of(format(
    'update guests set last_name = ''Changed'' where household_id = %L', tap_tests.id('e0')));
  perform tap_tests.logout();
  return next is((select count(*)::int from guests where household_id = tap_tests.id('e0') and last_name = 'Changed'),
                 0, 'couple B''s update of A''s guests changes nothing');

  perform tap_tests.login(tap_tests.id('a2'));
  perform tap_tests.sqlstate_of(format(
    'insert into project_needs (project_id, category) values (%L, ''florist'')', tap_tests.id('b2')));
  st := tap_tests.sqlstate_of(format(
    'update project_needs set project_id = %L where project_id = %L', tap_tests.id('b1'), tap_tests.id('b2')));
  perform tap_tests.logout();
  return next is(st, '42501', 'couple B cannot move own rows into A''s project');
end $$;

create function tap_tests.test_couple_writes_own() returns setof text language plpgsql as $$
declare st text;
begin
  perform tap_tests.login(tap_tests.id('a1'));
  st := tap_tests.sqlstate_of(format(
    'insert into project_needs (project_id, category) values (%L, ''dj'')', tap_tests.id('b1')));
  perform tap_tests.logout();
  return next is(st, null, 'couple A adds a need to own project');

  perform tap_tests.login(tap_tests.id('a1'));
  st := tap_tests.sqlstate_of(format(
    'insert into guests (household_id, first_name) values (%L, ''Cara'')', tap_tests.id('e0')));
  perform tap_tests.logout();
  return next is(st, null, 'couple A adds a guest (the Guest List is free)');

  -- Paid add-ons: writes need the add-on.
  perform tap_tests.login(tap_tests.id('a1'));
  st := tap_tests.sqlstate_of(format(
    'insert into registry_links (project_id, store, url) values (%L, ''Target'', ''https://target.com'')', tap_tests.id('b1')));
  perform tap_tests.logout();
  return next is(st, '42501', 'couple A cannot edit the registry without the add-on');

  insert into couple_addons (project_id, addon_key, source, active_until)
    values (tap_tests.id('b1'), 'registry', 'admin', now() + interval '1 day');
  perform tap_tests.login(tap_tests.id('a1'));
  st := tap_tests.sqlstate_of(format(
    'insert into registry_links (project_id, store, url) values (%L, ''Target'', ''https://target.com'')', tap_tests.id('b1')));
  perform tap_tests.logout();
  return next is(st, null, '... and can once it is unlocked');
end $$;

select * from runtests('tap_tests'::name, '^test_');
