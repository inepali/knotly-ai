-- GAP_ANALYSIS §5 fixes: S-2 (estimate price via view_quote), S-3 (vendor listings),
-- S-4 (definer/trigger functions not callable), plus server-owned columns.

create function tap_tests.test_s3_only_vendors_create_listings() returns setof text language plpgsql as $$
declare st text;
begin
  perform tap_tests.login(tap_tests.id('a2'));
  st := tap_tests.sqlstate_of(format(
    'insert into vendors (id, business_name, category) values (%L, ''Fake'', ''dj'')', tap_tests.id('a2')));
  perform tap_tests.logout();
  return next is(st, '42501', 'a couple cannot create a vendor listing');

  perform tap_tests.login(tap_tests.id('c2'));
  st := tap_tests.sqlstate_of(format(
    'insert into vendors (id, business_name, category) values (%L, ''Fake'', ''dj'')', tap_tests.id('a2')));
  perform tap_tests.logout();
  return next is(st, '42501', 'a vendor cannot create a listing for someone else');

  perform tap_tests.login(tap_tests.id('c2'));
  st := tap_tests.sqlstate_of(format(
    'update vendors set bio = ''Updated'' where id = %L', tap_tests.id('c2')));
  perform tap_tests.logout();
  return next is(st, null, 'a vendor edits own bio');

  perform tap_tests.login(tap_tests.id('c2'));
  perform tap_tests.sqlstate_of(format(
    'update vendors set bio = ''Hacked'' where id = %L', tap_tests.id('c1')));
  perform tap_tests.logout();
  return next isnt((select bio from vendors where id = tap_tests.id('c1')), 'Hacked',
                   'a vendor cannot edit another listing');
end $$;

create function tap_tests.test_server_owned_vendor_columns() returns setof text language plpgsql as $$
declare c text; st text;
begin
  foreach c in array array['slug = ''x''', 'plan = ''pro''', 'stripe_customer_id = ''cus_x''',
                           'subscription_status = ''active''', 'plan_renews_at = now()', 'embedding = null'] loop
    perform tap_tests.login(tap_tests.id('c2'));
    st := tap_tests.sqlstate_of(format('update vendors set %s where id = %L', c, tap_tests.id('c2')));
    perform tap_tests.logout();
    return next is(st, '42501', format('vendor cannot set %s', split_part(c, ' ', 1)));
  end loop;
end $$;

create function tap_tests.test_s4_functions_not_callable() returns setof text language plpgsql as $$
declare f text; who text; st text;
begin
  foreach f in array array[
    format('select vendor_credit_balance(%L)', tap_tests.id('c1')),
    format('select charge_estimate_view(%L)', tap_tests.id('81')),
    format('select record_sms_usage(%L, 1)', tap_tests.id('c1')),
    'select handle_new_user()',
    'select welcome_credits()',
    'select create_vendor_settings()',
    format('select merge_guest_into_user(%L, %L)', tap_tests.id('a1'), tap_tests.id('a2'))
  ] loop
    foreach who in array array['a1', 'anon'] loop
      if who = 'anon' then perform tap_tests.login_anon();
      else perform tap_tests.login(tap_tests.id(who)); end if;
      st := tap_tests.sqlstate_of(f);
      perform tap_tests.logout();
      return next is(st, '42501', format('%s cannot run: %s', who, split_part(f, '(', 1)));
    end loop;
  end loop;
end $$;

create function tap_tests.test_profiles_columns() returns setof text language plpgsql as $$
declare st text;
begin
  perform tap_tests.login(tap_tests.id('a1'));
  st := tap_tests.sqlstate_of(format(
    'update profiles set role = ''vendor'' where id = %L', tap_tests.id('a1')));
  perform tap_tests.logout();
  return next is(st, '42501', 'a couple cannot make themselves a vendor');

  perform tap_tests.login(tap_tests.id('a1'));
  st := tap_tests.sqlstate_of(format(
    'update profiles set phone_verified = true where id = %L', tap_tests.id('a1')));
  perform tap_tests.logout();
  return next is(st, '42501', 'phone_verified is server-only');

  perform tap_tests.login(tap_tests.id('a1'));
  st := tap_tests.sqlstate_of(format(
    'update profiles set sms_opt_in_at = now() where id = %L', tap_tests.id('a1')));
  perform tap_tests.logout();
  return next is(st, '42501', 'sms_opt_in_at is server-only (consent + STOP)');

  perform tap_tests.login(tap_tests.id('a1'));
  st := tap_tests.sqlstate_of(format(
    'update profiles set notify_prefs = ''{"email":false}'' where id = %L', tap_tests.id('a1')));
  perform tap_tests.logout();
  return next is(st, null, 'users edit own notify_prefs');
end $$;

create function tap_tests.test_s2_view_quote() returns setof text language plpgsql as $$
declare v int; total int; st text;
begin
  -- Couple B gets nothing; anon can't call it.
  perform tap_tests.login(tap_tests.id('a2'));
  v := tap_tests.n(format('select 1 from view_quote(%L)', tap_tests.id('81')));
  perform tap_tests.logout();
  return next is(v, 0, 'another couple cannot open the estimate');
  return next is((select count(*)::int from vendor_usage where ref_id = tap_tests.id('81')::text), 0,
                 '... and the vendor is not charged');

  perform tap_tests.login_anon();
  st := tap_tests.sqlstate_of(format('select view_quote(%L)', tap_tests.id('81')));
  perform tap_tests.logout();
  return next is(st, '42501', 'anon cannot call view_quote');

  -- The vendor sees their own estimate without being charged.
  perform tap_tests.login(tap_tests.id('c1'));
  select q.total into total from view_quote(tap_tests.id('81')) q;
  perform tap_tests.logout();
  return next is(total, 4800, 'vendor reads own estimate');
  return next is((select count(*)::int from vendor_usage where ref_id = tap_tests.id('81')::text), 0,
                 '... without a charge');

  -- The couple opens it twice: charged once ($1 on Pay as you go).
  perform tap_tests.login(tap_tests.id('a1'));
  select q.total into total from view_quote(tap_tests.id('81')) q;
  perform view_quote(tap_tests.id('81'));
  perform tap_tests.logout();
  return next is(total, 4800, 'couple opens the estimate and sees the price');
  return next is((select count(*)::int from vendor_usage where ref_id = tap_tests.id('81')::text), 1,
                 'one usage row for two opens');
  return next is((select amount_cents from vendor_usage where ref_id = tap_tests.id('81')::text), 100,
                 'Pay-as-you-go vendor charged 100 cents');
  return next is(wallet_balance(tap_tests.id('c1')), 900, 'wallet goes from 1000 to 900');
  return next isnt((select first_viewed_at from quotes where id = tap_tests.id('81')), null,
                   'first_viewed_at is set');
end $$;

select * from runtests('tap_tests'::name, '^test_');
