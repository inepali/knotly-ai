-- Shared rows: both parties of a booking read; status moves happen only in server code.
-- Also: couple-facing activity, own outbox rows, timeline assignments, shared documents.

create function tap_tests.test_bookings_and_contracts() returns setof text language plpgsql as $$
declare t text; who text; v int;
begin
  foreach t in array array['bookings', 'contracts'] loop
    foreach who in array array['a1', 'c1'] loop
      perform tap_tests.login(tap_tests.id(who));
      v := tap_tests.n(format('select 1 from %I', t));
      perform tap_tests.logout();
      return next is(v, 1, format('%s reads the A/V1 %s row', who, t));
    end loop;
    foreach who in array array['a2', 'c2', 'anon'] loop
      if who = 'anon' then perform tap_tests.login_anon();
      else perform tap_tests.login(tap_tests.id(who)); end if;
      v := tap_tests.n(format('select 1 from %I', t));
      perform tap_tests.logout();
      return next is(v, 0, format('%s cannot read the A/V1 %s', who, t));
    end loop;
  end loop;
end $$;

create function tap_tests.test_bookings_written_by_server_only() returns setof text language plpgsql as $$
declare st text; who text;
begin
  foreach who in array array['a1', 'c1'] loop
    perform tap_tests.login(tap_tests.id(who));
    perform tap_tests.sqlstate_of(format(
      'update bookings set status = ''booked'', price = 1 where id = %L', tap_tests.id('61')));
    perform tap_tests.logout();
    return next is((select status from bookings where id = tap_tests.id('61')), 'held',
                   format('%s cannot change booking status or price', who));

    perform tap_tests.login(tap_tests.id(who));
    perform tap_tests.sqlstate_of(format(
      'update contracts set status = ''countersigned'' where booking_id = %L', tap_tests.id('61')));
    perform tap_tests.logout();
    return next is((select status from contracts where booking_id = tap_tests.id('61')), 'sent',
                   format('%s cannot sign a contract directly', who));
  end loop;

  perform tap_tests.login(tap_tests.id('a2'));
  st := tap_tests.sqlstate_of(format(
    'insert into bookings (project_id, vendor_id, package_id, event_date, price) values (%L, %L, %L, ''2027-06-05'', 1)',
    tap_tests.id('b2'), tap_tests.id('c2'), tap_tests.id('d2')));
  perform tap_tests.logout();
  return next is(st, '42501', 'couples cannot insert bookings directly (server action only)');
end $$;

create function tap_tests.test_one_open_booking() returns setof text language plpgsql as $$
declare st text;
begin
  st := tap_tests.sqlstate_of(format(
    'insert into bookings (project_id, vendor_id, package_id, event_date, price) values (%L, %L, %L, ''2027-10-16'', 4800)',
    tap_tests.id('b1'), tap_tests.id('c1'), tap_tests.id('d1')));
  return next is(st, '23505', 'a second open booking for the same couple + vendor is refused');
end $$;

create function tap_tests.test_activity_events() returns setof text language plpgsql as $$
declare v int;
begin
  perform tap_tests.login(tap_tests.id('c1'));
  v := tap_tests.n('select 1 from activity_events');
  perform tap_tests.logout();
  return next is(v, 2, 'vendor reads all own activity');

  perform tap_tests.login(tap_tests.id('a1'));
  v := tap_tests.n('select 1 from activity_events');
  perform tap_tests.logout();
  return next is(v, 1, 'couple reads only couple-facing activity');

  perform tap_tests.login(tap_tests.id('a2'));
  v := tap_tests.n('select 1 from activity_events');
  perform tap_tests.logout();
  return next is(v, 0, 'other couple reads no activity');
end $$;

create function tap_tests.test_outbox_own_rows() returns setof text language plpgsql as $$
declare v int; st text;
begin
  perform tap_tests.login(tap_tests.id('a1'));
  v := tap_tests.n('select 1 from outbox');
  perform tap_tests.logout();
  return next is(v, 1, 'couple reads only own outbox row');

  perform tap_tests.login(tap_tests.id('c1'));
  v := tap_tests.n('select 1 from outbox');
  perform tap_tests.logout();
  return next is(v, 1, 'vendor reads only own outbox row');

  perform tap_tests.login(tap_tests.id('c1'));
  st := tap_tests.sqlstate_of(format(
    'insert into outbox (to_profile, channel, template, payload) values (%L, ''sms'', ''x'', ''{}'')',
    tap_tests.id('a2')));
  perform tap_tests.logout();
  return next is(st, '42501', 'nobody queues messages except the server');
end $$;

create function tap_tests.test_timeline_assignments() returns setof text language plpgsql as $$
declare v int; st text;
begin
  perform tap_tests.login(tap_tests.id('c1'));
  v := tap_tests.n('select 1 from timeline_events');
  perform tap_tests.logout();
  return next is(v, 1, 'V1 reads only the event assigned to them');

  perform tap_tests.login(tap_tests.id('c2'));
  v := tap_tests.n('select 1 from timeline_events');
  perform tap_tests.logout();
  return next is(v, 0, 'V2 reads no events');

  perform tap_tests.login(tap_tests.id('a1'));
  st := tap_tests.sqlstate_of(format(
    'insert into timeline_assignments (event_id, vendor_id) values (%L, %L)', tap_tests.id('f2'), tap_tests.id('c2')));
  perform tap_tests.logout();
  return next is(st, '42501', 'couple cannot assign a vendor they have no booking with');

  perform tap_tests.login(tap_tests.id('a1'));
  st := tap_tests.sqlstate_of(format(
    'insert into timeline_assignments (event_id, vendor_id) values (%L, %L)', tap_tests.id('f2'), tap_tests.id('c1')));
  perform tap_tests.logout();
  return next is(st, null, 'couple assigns a booked vendor');

  perform tap_tests.login(tap_tests.id('c1'));
  st := tap_tests.sqlstate_of(format(
    'insert into timeline_assignments (event_id, vendor_id) values (%L, %L)', tap_tests.id('f2'), tap_tests.id('c1')));
  perform tap_tests.logout();
  return next is(st, '42501', 'vendor cannot assign themselves');
end $$;

create function tap_tests.test_shared_documents() returns setof text language plpgsql as $$
declare v int; st text;
begin
  perform tap_tests.login(tap_tests.id('c1'));
  v := tap_tests.n('select 1 from documents');
  perform tap_tests.logout();
  return next is(v, 1, 'V1 reads only the document shared with them');

  perform tap_tests.login(tap_tests.id('c2'));
  v := tap_tests.n('select 1 from documents');
  perform tap_tests.logout();
  return next is(v, 0, 'V2 reads no documents');

  perform tap_tests.login(tap_tests.id('c1'));
  st := tap_tests.sqlstate_of(format(
    'insert into document_shares (document_id, vendor_id) values (%L, %L)', tap_tests.id('92'), tap_tests.id('c1')));
  perform tap_tests.logout();
  return next is(st, '42501', 'vendor cannot share a document with themselves');

  perform tap_tests.login(tap_tests.id('a1'));
  st := tap_tests.sqlstate_of(format(
    'insert into document_shares (document_id, vendor_id) values (%L, %L)', tap_tests.id('92'), tap_tests.id('c2')));
  perform tap_tests.logout();
  return next is(st, null, 'couple shares own document with a vendor');

  perform tap_tests.login(tap_tests.id('a2'));
  st := tap_tests.sqlstate_of(format(
    'insert into document_shares (document_id, vendor_id) values (%L, %L)', tap_tests.id('92'), tap_tests.id('c2')));
  perform tap_tests.logout();
  return next is(st, '42501', 'another couple cannot share A''s document');

  perform tap_tests.login(tap_tests.id('c1'));
  perform tap_tests.sqlstate_of(format('delete from documents where id = %L', tap_tests.id('91')));
  perform tap_tests.logout();
  return next is((select count(*)::int from documents where id = tap_tests.id('91')), 1,
                 'vendor cannot delete a shared document');
end $$;

select * from runtests('tap_tests'::name, '^test_');
