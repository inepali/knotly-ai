-- Vendor-owned tables: vendor_id = auth.uid(). V1 sees and writes only their own rows;
-- V2, couples and anon see nothing. Billing rows are read-only for vendors.

create function tap_tests.vendor_tables() returns text[] language sql as $$
  select array['contract_templates', 'vendor_tasks', 'wallet_transactions', 'vendor_usage'];
$$;

create function tap_tests.test_vendor_reads_own() returns setof text language plpgsql as $$
declare t text; v int;
begin
  foreach t in array tap_tests.vendor_tables() loop
    perform tap_tests.login(tap_tests.id('c1'));
    v := tap_tests.n(format('select 1 from %I where vendor_id = %L', t, tap_tests.id('c1')));
    perform tap_tests.logout();
    return next ok(v > 0, format('vendor V1 reads own %s', t));
  end loop;
end $$;

create function tap_tests.test_others_read_nothing() returns setof text language plpgsql as $$
declare t text; who text; v int;
begin
  foreach t in array tap_tests.vendor_tables() loop
    foreach who in array array['c2', 'a1', 'anon'] loop
      if who = 'anon' then perform tap_tests.login_anon();
      else perform tap_tests.login(tap_tests.id(who)); end if;
      v := tap_tests.n(format('select 1 from %I where vendor_id = %L', t, tap_tests.id('c1')));
      perform tap_tests.logout();
      return next is(v, 0, format('%s cannot read V1''s %s', who, t));
    end loop;
  end loop;
end $$;

create function tap_tests.test_message_templates() returns setof text language plpgsql as $$
declare defaults int; v int; st text;
begin
  select count(*) into defaults from message_templates where vendor_id is null;

  perform tap_tests.login(tap_tests.id('c1'));
  v := tap_tests.n('select 1 from message_templates');
  perform tap_tests.logout();
  return next is(v, defaults + 1, 'V1 reads Knotly defaults + own override');

  perform tap_tests.login(tap_tests.id('c2'));
  v := tap_tests.n(format('select 1 from message_templates where vendor_id = %L', tap_tests.id('c1')));
  perform tap_tests.logout();
  return next is(v, 0, 'V2 cannot read V1''s templates');

  perform tap_tests.login(tap_tests.id('c2'));
  st := tap_tests.sqlstate_of(format(
    'insert into message_templates (vendor_id, event, channel, body) values (%L, ''followup_1'', ''email'', ''x'')',
    tap_tests.id('c1')));
  perform tap_tests.logout();
  return next is(st, '42501', 'V2 cannot write a template for V1');

  perform tap_tests.login(tap_tests.id('c2'));
  st := tap_tests.sqlstate_of(
    'insert into message_templates (vendor_id, event, channel, body) values (null, ''followup_1'', ''sms'', ''x'')');
  perform tap_tests.logout();
  return next is(st, '42501', 'vendors cannot add Knotly default templates');

  perform tap_tests.login(tap_tests.id('c2'));
  perform tap_tests.sqlstate_of('update message_templates set body = ''hacked'' where vendor_id is null');
  perform tap_tests.logout();
  return next is((select count(*)::int from message_templates where body = 'hacked'), 0,
                 'vendors cannot edit Knotly default templates');

  perform tap_tests.login(tap_tests.id('c2'));
  st := tap_tests.sqlstate_of(format(
    'insert into message_templates (vendor_id, event, channel, body) values (%L, ''followup_1'', ''email'', ''Mine'')',
    tap_tests.id('c2')));
  perform tap_tests.logout();
  return next is(st, null, 'V2 writes own template');
end $$;

create function tap_tests.test_vendor_cannot_write_for_others() returns setof text language plpgsql as $$
declare st text;
begin
  perform tap_tests.login(tap_tests.id('c2'));
  st := tap_tests.sqlstate_of(format(
    'insert into vendor_tasks (vendor_id, title) values (%L, ''x'')', tap_tests.id('c1')));
  perform tap_tests.logout();
  return next is(st, '42501', 'V2 cannot add a task for V1');

  perform tap_tests.login(tap_tests.id('c2'));
  st := tap_tests.sqlstate_of(format(
    'insert into contract_templates (vendor_id, body) values (%L, ''x'')', tap_tests.id('c1')));
  perform tap_tests.logout();
  return next is(st, '42501', 'V2 cannot write V1''s contract template');
end $$;

create function tap_tests.test_billing_is_read_only() returns setof text language plpgsql as $$
declare st text; bal int;
begin
  perform tap_tests.login(tap_tests.id('c1'));
  st := tap_tests.sqlstate_of(format(
    'insert into wallet_transactions (vendor_id, kind, amount_cents) values (%L, ''adjust'', 100000)',
    tap_tests.id('c1')));
  perform tap_tests.logout();
  return next is(st, '42501', 'vendor cannot credit own wallet');

  perform tap_tests.login(tap_tests.id('c1'));
  st := tap_tests.sqlstate_of(format(
    'delete from vendor_usage where vendor_id = %L', tap_tests.id('c1')));
  perform tap_tests.logout();
  return next is((select count(*)::int from vendor_usage where vendor_id = tap_tests.id('c1')), 1,
                 'vendor cannot delete own usage');

  perform tap_tests.login(tap_tests.id('c1'));
  st := tap_tests.sqlstate_of('update plan_pricing set estimate_view_cents = 0');
  perform tap_tests.logout();
  return next is((select estimate_view_cents from plan_pricing where plan = 'payg'), 100,
                 'vendor cannot change pricing');

  perform tap_tests.login(tap_tests.id('c1'));
  bal := wallet_balance(tap_tests.id('c1'));
  perform tap_tests.logout();
  return next is(bal, 1000, 'V1 sees own wallet balance');

  perform tap_tests.login(tap_tests.id('c2'));
  bal := wallet_balance(tap_tests.id('c1'));
  perform tap_tests.logout();
  return next is(bal, 0, 'V2 sees 0 for V1''s wallet (RLS)');
end $$;

select * from runtests('tap_tests'::name, '^test_');
