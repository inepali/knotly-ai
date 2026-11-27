-- Public pages closed to anon, shared timeline, Help cap, SMS usage, triggers, storage folder policies.

create function tap_tests.test_help_cap() returns setof text language plpgsql as $$
declare i int; ok_count int := 0; last boolean; st text; v int;
begin
  -- The server calls take_help_quota with the service role; the test runner stands in for it.
  for i in 1..31 loop
    last := take_help_quota('u:' || tap_tests.id('a1'), 30);
    if last then ok_count := ok_count + 1; end if;
  end loop;
  return next is(ok_count, 30, '30 Help messages allowed per day');
  return next is(last, false, 'the 31st is refused');

  perform tap_tests.login(tap_tests.id('a1'));
  st := tap_tests.sqlstate_of('select take_help_quota(''u:x'', 30)');
  v := tap_tests.n('select 1 from help_quota_usage');
  perform tap_tests.logout();
  return next is(st, '42501', 'a couple cannot call take_help_quota directly');
  return next is(v, 0, 'a couple cannot read or reset the counters');

  perform tap_tests.login_anon();
  st := tap_tests.sqlstate_of('select take_help_quota(''ip:x'', 30)');
  perform tap_tests.logout();
  return next is(st, '42501', 'anon cannot call take_help_quota directly');
end $$;

-- The public website, RSVP and registry are served by the server with the service role (couple
-- add-ons), so anon has no direct access to any of their tables.
create function tap_tests.test_public_pages_closed_to_anon() returns setof text language plpgsql as $$
declare t text; v int; st text;
begin
  foreach t in array array['wedding_sites', 'guest_households', 'guests', 'wedding_events', 'registry_links',
                           'rsvp_responses', 'rsvp_households', 'couple_addons'] loop
    perform tap_tests.login_anon();
    v := tap_tests.n(format('select 1 from %I', t));
    perform tap_tests.logout();
    return next is(v, 0, format('anon reads no %s', t));
  end loop;

  perform tap_tests.login_anon();
  st := tap_tests.sqlstate_of(format(
    'insert into rsvp_responses (guest_id, status) values (%L, ''attending'')', tap_tests.id('e1')));
  perform tap_tests.logout();
  return next is(st, '42501', 'anon cannot write RSVP answers directly');
end $$;

create function tap_tests.test_shared_timeline() returns setof text language plpgsql as $$
declare j jsonb; token uuid;
begin
  token := (select timeline_share_token from couple_projects where id = tap_tests.id('b1'));
  perform tap_tests.login_anon();
  j := shared_timeline(token);
  perform tap_tests.logout();
  return next is(jsonb_array_length(j->'events'), 1, 'shared timeline hides couple-only events');
end $$;

create function tap_tests.test_sms_usage() returns setof text language plpgsql as $$
declare i int; amt int;
begin
  -- V2 is on Basic: 200 included, then 20 cents each, no wallet deduction.
  for i in 1..200 loop
    perform record_sms_usage(tap_tests.id('c2'), 100000 + i);
  end loop;
  return next is((select sum(amount_cents)::int from vendor_usage where vendor_id = tap_tests.id('c2')), 0,
                 'first 200 texts on Basic are included');
  amt := record_sms_usage(tap_tests.id('c2'), 100201);
  return next is(amt, 20, 'text 201 on Basic costs 20 cents');
  return next is(record_sms_usage(tap_tests.id('c2'), 100201), 0, 'recording the same text twice charges nothing');
  return next is(wallet_balance(tap_tests.id('c2')), 0, 'Basic overage is invoiced, not taken from a wallet');

  -- V1 is Pay as you go: 20 cents from the wallet.
  amt := record_sms_usage(tap_tests.id('c1'), 100300);
  return next is(amt, 20, 'Pay-as-you-go text costs 20 cents');
  return next is(wallet_balance(tap_tests.id('c1')), 980, '... deducted from the wallet');
end $$;

create function tap_tests.test_triggers() returns setof text language plpgsql as $$
begin
  insert into vendors (id, business_name, category)
  select tap_tests.id('a2'), 'Test Vendor One', 'dj';
  return next is((select slug from vendors where id = tap_tests.id('a2')), 'test-vendor-one-2',
                 'duplicate business names get -2 slugs');

  update budget_items set planned = 5000 where project_id = tap_tests.id('b1');
  return next is((select estimated from budget_items where project_id = tap_tests.id('b1')), 5000,
                 'old planned writes flow into estimated');
  update budget_items set estimated = 4500 where project_id = tap_tests.id('b1');
  return next is((select planned from budget_items where project_id = tap_tests.id('b1')), 4500,
                 'new estimated writes flow into planned');
end $$;

create function tap_tests.test_storage_folders() returns setof text language plpgsql as $$
declare st text;
begin
  perform tap_tests.login(tap_tests.id('a1'));
  st := tap_tests.sqlstate_of(format(
    'insert into storage.objects (bucket_id, name) values (''documents'', %L)', tap_tests.id('b1') || '/x.pdf'));
  perform tap_tests.logout();
  return next is(st, null, 'couple uploads into own documents folder');

  perform tap_tests.login(tap_tests.id('a2'));
  st := tap_tests.sqlstate_of(format(
    'insert into storage.objects (bucket_id, name) values (''documents'', %L)', tap_tests.id('b1') || '/y.pdf'));
  perform tap_tests.logout();
  return next is(st, '42501', 'another couple cannot upload into A''s folder');

  perform tap_tests.login(tap_tests.id('c1'));
  st := tap_tests.sqlstate_of(format(
    'insert into storage.objects (bucket_id, name) values (''documents'', %L)', tap_tests.id('b1') || '/z.pdf'));
  perform tap_tests.logout();
  return next is(st, '42501', 'a vendor cannot upload into a couple''s documents');

  perform tap_tests.login(tap_tests.id('c1'));
  st := tap_tests.sqlstate_of(format(
    'insert into storage.objects (bucket_id, name) values (''vendor-photos'', %L)', tap_tests.id('c1') || '/a.jpg'));
  perform tap_tests.logout();
  return next is(st, null, 'vendor uploads own photo');

  perform tap_tests.login(tap_tests.id('c2'));
  st := tap_tests.sqlstate_of(format(
    'insert into storage.objects (bucket_id, name) values (''vendor-photos'', %L)', tap_tests.id('c1') || '/b.jpg'));
  perform tap_tests.logout();
  return next is(st, '42501', 'vendor cannot upload into another vendor''s photos');

  perform tap_tests.login(tap_tests.id('a1'));
  st := tap_tests.sqlstate_of(
    'insert into storage.objects (bucket_id, name) values (''contracts'', ''anything/c.pdf'')');
  perform tap_tests.logout();
  return next is(st, '42501', 'contracts bucket is server-only');

  perform tap_tests.login(tap_tests.id('a1'));
  st := tap_tests.sqlstate_of(
    'insert into storage.objects (bucket_id, name) values (''documents'', ''not-a-uuid/x.pdf'')');
  perform tap_tests.logout();
  return next is(st, '42501', 'malformed folder is refused, not an error');
end $$;

select * from runtests('tap_tests'::name, '^test_');
