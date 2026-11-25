-- Public website + RSVP functions, Help cap, SMS usage, triggers, storage folder policies.

create function tap_tests.test_help_cap() returns setof text language plpgsql as $$
declare i int; ok_count int := 0; last boolean; st text;
begin
  perform tap_tests.login(tap_tests.id('a1'));
  for i in 1..31 loop
    last := take_help_message();
    if last then ok_count := ok_count + 1; end if;
  end loop;
  perform tap_tests.logout();
  return next is(ok_count, 30, '30 Help messages allowed per day');
  return next is(last, false, 'the 31st is refused');

  perform tap_tests.login(tap_tests.id('a1'));
  st := tap_tests.sqlstate_of(format(
    'update help_usage set messages = 0 where profile_id = %L', tap_tests.id('a1')));
  perform tap_tests.logout();
  return next is((select messages from help_usage where profile_id = tap_tests.id('a1')), 30,
                 'couple cannot reset own count');

  perform tap_tests.login_anon();
  st := tap_tests.sqlstate_of('select take_help_message()');
  perform tap_tests.logout();
  return next is(st, '42501', 'anon cannot use the Help assistant');
end $$;

create function tap_tests.test_public_website() returns setof text language plpgsql as $$
declare j jsonb; st text;
begin
  perform tap_tests.login_anon();
  j := public_website('tap-priya-and-sam');
  perform tap_tests.logout();
  return next is(j->>'partner_names', 'Priya & Sam', 'anon reads a published site');
  return next is(jsonb_array_length(j->'schedule'), 1, 'schedule shows only "everyone" events');
  return next ok(j->'guests' is null and j::text not like '%Lopez%', 'no guest data on the public site');

  perform tap_tests.login(tap_tests.id('a2'));
  st := tap_tests.sqlstate_of(format('select set_website_password(%L, ''pw'')', tap_tests.id('b1')));
  perform tap_tests.logout();
  return next is(st, 'P0001', 'another couple cannot set A''s site password');

  perform tap_tests.login(tap_tests.id('a1'));
  perform set_website_password(tap_tests.id('b1'), 'secret word');
  st := tap_tests.sqlstate_of(format(
    'update wedding_websites set password_hash = ''x'' where project_id = %L', tap_tests.id('b1')));
  perform tap_tests.logout();
  return next is(st, '42501', 'password_hash is not directly writable');

  perform tap_tests.login_anon();
  j := public_website('tap-priya-and-sam');
  perform tap_tests.logout();
  return next is(j, '{"locked": true}'::jsonb, 'password-protected site is locked without it');

  perform tap_tests.login_anon();
  j := public_website('tap-priya-and-sam', 'wrong');
  perform tap_tests.logout();
  return next is(j->>'locked', 'true', '... and with a wrong password');

  perform tap_tests.login_anon();
  j := public_website('tap-priya-and-sam', 'secret word');
  perform tap_tests.logout();
  return next is(j->>'locked', 'false', '... and opens with the right one');

  update wedding_websites set published = false where project_id = tap_tests.id('b1');
  perform tap_tests.login_anon();
  j := public_website('tap-priya-and-sam', 'secret word');
  perform tap_tests.logout();
  return next is(j, null, 'unpublished site returns nothing');
end $$;

create function tap_tests.test_rsvp() returns setof text language plpgsql as $$
declare j jsonb; ok boolean; token uuid;
begin
  perform tap_tests.login_anon();
  j := find_rsvp('tap-priya-and-sam', null, 'ana', 'LOPEZ');
  perform tap_tests.logout();
  return next is((j->>'found')::boolean, true, 'guest finds themselves by name (case-insensitive)');
  return next is(jsonb_array_length(j->'guests'), 2, '... with their household');

  perform tap_tests.login_anon();
  j := find_rsvp('tap-priya-and-sam', null, 'Zed', 'Nobody');
  perform tap_tests.logout();
  return next is((j->>'found')::boolean, false, 'unknown name is not found');

  perform tap_tests.login_anon();
  ok := submit_rsvp('tap-priya-and-sam', null, tap_tests.id('e1'), 'attending', 'Fish', null, 'Raj');
  perform tap_tests.logout();
  return next is(ok, true, 'guest RSVPs without an account');
  return next is((select rsvp || '/' || plus_one_name from guests where id = tap_tests.id('e1')),
                 'attending/Raj', 'RSVP and plus-one saved');

  perform tap_tests.login_anon();
  ok := submit_rsvp('tap-priya-and-sam', null, tap_tests.id('e2'), 'attending', null, null, 'Sneaky');
  perform tap_tests.logout();
  return next is((select plus_one_name from guests where id = tap_tests.id('e2')), null,
                 'plus-one ignored when not allowed');

  insert into wedding_websites (project_id, slug, published) values (tap_tests.id('b2'), 'tap-jo-and-lee', true);
  perform tap_tests.login_anon();
  ok := submit_rsvp('tap-jo-and-lee', null, tap_tests.id('e1'), 'declined');
  perform tap_tests.logout();
  return next is(ok, false, 'another site cannot RSVP for A''s guest');
  return next is((select rsvp from guests where id = tap_tests.id('e1')), 'attending', '... and nothing changes');

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
