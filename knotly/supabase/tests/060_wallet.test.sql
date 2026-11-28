-- Pricing & vendor wallet (20261128120000_vendor_wallet.sql): pricing config, holds, lead charge,
-- signup credit, reloads, admin adjustments, spam credits, SMS overage, and who may call what.
-- Fixtures: V1 (c1) is Pay as you go with a 1000-cent top-up; V2 (c2) is Basic; quote 81 is A <-> V1.

-- A second estimate A <-> V1 and an admin, for the tests that need them.
create function tap_tests.wallet_fixtures() returns void language plpgsql as $$
begin
  insert into quotes (id, thread_id, package_id, line_items, total, valid_until) values
    (tap_tests.id('82'), tap_tests.id('71'), tap_tests.id('d1'), '[]', 4800, '2027-01-01');
  insert into auth.users (id, email, raw_user_meta_data) values
    (tap_tests.id('e9'), 'admin@test.invalid', '{"role":"couple"}');
  update profiles set role = 'admin' where id = tap_tests.id('e9');
end $$;

create function tap_tests.test_wallet_pricing() returns setof text language plpgsql as $$
declare p pricing_config;
begin
  p := vendor_pricing(tap_tests.id('c1'));
  return next is(p.lead_fee_cents, 100, 'default lead fee is $1');
  return next is(p.reload_below_cents, 1000, 'reload allowed under $10');
  return next is(p.signup_credit_cents, 1000, 'signup credit is $10');
  return next is(p.sms_free_monthly, 50, '50 free texts a month');

  insert into pricing_config (metro_slug, lead_fee_cents) values ('charlotte-nc', 150);
  return next is((vendor_pricing(tap_tests.id('c1'))).lead_fee_cents, 150, 'a metro row overrides the default');
  return next is((vendor_pricing(tap_tests.id('a1'))).lead_fee_cents, 100, 'unknown vendor falls back to the default');
end $$;

create function tap_tests.test_wallet_holds() returns setof text language plpgsql as $$
declare st text;
begin
  -- Step 3: quote 81 (from _setup.sql) placed its hold when it was inserted.
  return next is((select status from wallet_holds where quote_id = tap_tests.id('81')), 'held', 'sending an estimate holds the fee');
  return next is(place_estimate_hold(tap_tests.id('81')), true, '... idempotent');
  return next is((select count(*)::int from wallet_holds where quote_id = tap_tests.id('81')), 1, 'one hold row');
  return next is(wallet_held(tap_tests.id('c1')), 100, '$1 on hold');
  return next is(wallet_available(tap_tests.id('c1')), 900, 'available = balance - held');
  return next is(wallet_balance(tap_tests.id('c1')), 1000, 'balance unchanged by a hold');
  return next is((select lead_fee_cents from quotes where id = tap_tests.id('81')), 100, 'fee copied onto the estimate');

  -- Not enough available: the estimate isn't created (KN402) and nothing is held.
  insert into wallet_transactions (vendor_id, kind, amount_cents, note) values (tap_tests.id('c1'), 'adjust', -850, 'test');
  return next is(vendor_can_take_lead(tap_tests.id('c1')), false, 'V1 can''t take a lead with $0.50 available');
  st := tap_tests.sqlstate_of(format(
    'insert into quotes (id, thread_id, line_items, total, valid_until) values (%L, %L, ''[]'', 1, ''2027-01-01'')',
    tap_tests.id('82'), tap_tests.id('71')));
  return next is(st, 'KN402', 'estimate refused when available < fee');
  return next is((select count(*)::int from quotes where id = tap_tests.id('82')), 0, '... not created');
  return next is((select count(*)::int from wallet_holds where quote_id = tap_tests.id('82')), 0, '... and nothing held');

  -- Release gives it back, once.
  return next is(release_estimate_hold(tap_tests.id('81'), 'withdrawn'), true, 'hold released');
  return next is(release_estimate_hold(tap_tests.id('81'), 'withdrawn'), false, '... only once');
  return next is(wallet_held(tap_tests.id('c1')), 0, 'nothing on hold after release');

  -- Basic vendors never need a hold, even with an empty wallet.
  return next is(vendor_can_take_lead(tap_tests.id('c2')), true, 'Basic vendor can always take a lead');
  insert into threads (id, project_id, vendor_id) values (tap_tests.id('72'), tap_tests.id('b1'), tap_tests.id('c2'));
  insert into quotes (id, thread_id, line_items, total, valid_until) values
    (tap_tests.id('83'), tap_tests.id('72'), '[]', 1600, '2027-01-01');
  return next is((select count(*)::int from wallet_holds where quote_id = tap_tests.id('83')), 0, 'Basic vendor: no hold written');
  return next is(vendor_can_take_lead(tap_tests.id('a1')), false, 'not a vendor: no');
end $$;

create function tap_tests.test_wallet_status_releases_hold() returns setof text language plpgsql as $$
begin
  perform tap_tests.wallet_fixtures();
  return next is(wallet_held(tap_tests.id('c1')), 200, 'two estimates held');
  update quotes set status = 'declined' where id = tap_tests.id('81');
  update quotes set status = 'expired' where id = tap_tests.id('82');
  return next is((select release_reason from wallet_holds where quote_id = tap_tests.id('81')), 'declined', 'declined releases the hold');
  return next is((select release_reason from wallet_holds where quote_id = tap_tests.id('82')), 'expired', 'expired releases the hold');
  return next is(wallet_held(tap_tests.id('c1')), 0, 'nothing on hold');
  return next is(wallet_balance(tap_tests.id('c1')), 1000, 'nothing charged');
end $$;

create function tap_tests.test_wallet_open_captures_hold() returns setof text language plpgsql as $$
begin
  perform place_estimate_hold(tap_tests.id('81'));
  perform tap_tests.login(tap_tests.id('a1'));
  perform view_quote(tap_tests.id('81'));
  perform view_quote(tap_tests.id('81'));
  perform tap_tests.logout();
  return next is((select status from wallet_holds where quote_id = tap_tests.id('81')), 'captured', 'open captures the hold');
  return next is(wallet_balance(tap_tests.id('c1')), 900, 'charged $1 once for two opens');
  return next is(wallet_held(tap_tests.id('c1')), 0, 'nothing left on hold');
  return next is((select quote_id from wallet_transactions where kind = 'estimate_view'), tap_tests.id('81'),
                 'charge row points at the estimate');
  return next is(release_estimate_hold(tap_tests.id('81'), 'expired'), false, 'a captured hold cannot be released');
end $$;

create function tap_tests.test_wallet_never_negative() returns setof text language plpgsql as $$
begin
  -- Legacy estimate (no hold) and an empty wallet: the open is free, the balance stays at 0.
  delete from wallet_holds where quote_id = tap_tests.id('81');   -- as if sent before step 3
  insert into wallet_transactions (vendor_id, kind, amount_cents, note) values (tap_tests.id('c1'), 'adjust', -1000, 'test');
  perform tap_tests.login(tap_tests.id('a1'));
  perform view_quote(tap_tests.id('81'));
  perform tap_tests.logout();
  return next is(wallet_balance(tap_tests.id('c1')), 0, 'balance does not go negative');
  return next is((select amount_cents from vendor_usage where ref_id = tap_tests.id('81')::text), 0, 'recorded as a free lead');
end $$;

create function tap_tests.test_wallet_stale_holds() returns setof text language plpgsql as $$
begin
  perform tap_tests.wallet_fixtures();
  perform place_estimate_hold(tap_tests.id('81'));
  perform place_estimate_hold(tap_tests.id('82'));
  update wallet_holds set created_at = now() - interval '31 days' where quote_id = tap_tests.id('81');
  update quotes set valid_until = current_date - 1 where id = tap_tests.id('82');  -- past its date
  return next is(release_stale_holds(), 2, '30-day-old and past-date holds released');
  return next is((select release_reason from wallet_holds where quote_id = tap_tests.id('82')), 'expired', 'reason kept');
  return next is(wallet_held(tap_tests.id('c1')), 0, 'nothing on hold');
end $$;

create function tap_tests.test_wallet_signup_credit() returns setof text language plpgsql as $$
declare amt int;
begin
  -- Not verified yet: nothing.
  update profiles set phone = '(704) 555-0101' where id = tap_tests.id('c1');
  return next is(grant_signup_credit(tap_tests.id('c1')), 0, 'no credit before phone verification');

  update profiles set phone_verified = true where id = tap_tests.id('c1');
  amt := grant_signup_credit(tap_tests.id('c1'));
  return next is(amt, 1000, '$10 after phone verification');
  return next is(grant_signup_credit(tap_tests.id('c1')), 0, '... only once');
  return next is(wallet_balance(tap_tests.id('c1')), 2000, 'added to the balance');

  -- Same phone on another vendor: no credit.
  update profiles set phone = '704-555-0101', phone_verified = true where id = tap_tests.id('c2');
  return next is(grant_signup_credit(tap_tests.id('c2')), 0, 'same phone number gets none');

  -- Same business name + metro with a new phone: no credit.
  update profiles set phone = '7045550199' where id = tap_tests.id('c2');
  update vendors set business_name = 'Test Vendor One' where id = tap_tests.id('c2');
  return next is(grant_signup_credit(tap_tests.id('c2')), 0, 'same business gets none');
end $$;

-- Step 2: a confirmed email (the sign-up code) also unlocks the credit, once per inbox.
create function tap_tests.test_wallet_signup_credit_email() returns setof text language plpgsql as $$
begin
  return next is(normalize_email('Jane.Doe+knotly@GoogleMail.com'), 'janedoe@gmail.com', 'gmail dots and +tags ignored');
  return next is(normalize_email('jo.ann+x@Example.com'), 'jo.ann@example.com', 'other domains drop the +tag only');
  return next is(normalize_email('nope'), null, 'not an email');

  return next is(grant_signup_credit(tap_tests.id('c1')), 0, 'no credit before the email is confirmed');
  update auth.users set email_confirmed_at = now() where id = tap_tests.id('c1');
  return next is(grant_signup_credit(tap_tests.id('c1')), 1000, '$10 once the email is confirmed');
  return next is(grant_signup_credit(tap_tests.id('c1')), 0, '... only once');
  return next is((select email_key from signup_credit_claims where vendor_id = tap_tests.id('c1')),
                 'vendor-1@test.invalid', 'claim keyed on the normalized email');

  -- Same inbox with a +tag on another vendor: none.
  update auth.users set email = 'vendor-1+again@test.invalid', email_confirmed_at = now() where id = tap_tests.id('c2');
  return next is(grant_signup_credit(tap_tests.id('c2')), 0, 'same inbox (+tag) gets none');

  -- A different inbox and business: credited.
  update auth.users set email = 'other@test.invalid' where id = tap_tests.id('c2');
  return next is(grant_signup_credit(tap_tests.id('c2')), 1000, 'a different inbox and business is credited');
end $$;

create function tap_tests.test_wallet_reload() returns setof text language plpgsql as $$
declare st text;
begin
  return next is(can_reload(tap_tests.id('c1')), false, 'cannot reload at exactly $10');
  insert into wallet_transactions (vendor_id, kind, amount_cents, note) values (tap_tests.id('c1'), 'adjust', -1, 'test');
  return next is(can_reload(tap_tests.id('c1')), true, 'can reload at $9.99');

  return next is(credit_wallet(tap_tests.id('c1'), 4000, 'cs_test_1'), true, '$40 reload credited');
  return next is(credit_wallet(tap_tests.id('c1'), 4000, 'cs_test_1'), false, '... a repeat webhook credits nothing');
  return next is(wallet_balance(tap_tests.id('c1')), 4999, 'balance includes the reload once');

  st := tap_tests.sqlstate_of(format('select credit_wallet(%L, 1500, ''cs_test_2'')', tap_tests.id('c1')));
  return next is(st, 'P0001', 'not a $20 step is refused');
  st := tap_tests.sqlstate_of(format('select credit_wallet(%L, 12000, ''cs_test_3'')', tap_tests.id('c1')));
  return next is(st, 'P0001', 'more than $100 is refused');
end $$;

create function tap_tests.test_wallet_admin_adjust() returns setof text language plpgsql as $$
declare st text;
begin
  perform tap_tests.wallet_fixtures();
  perform admin_adjust_wallet(tap_tests.id('c1'), 500, 'goodwill', tap_tests.id('e9'));
  return next is(wallet_balance(tap_tests.id('c1')), 1500, 'admin credit applied');
  st := tap_tests.sqlstate_of(format('select admin_adjust_wallet(%L, -5000, ''x'', %L)', tap_tests.id('c1'), tap_tests.id('e9')));
  return next is(st, 'P0001', 'debit beyond available refused');
  st := tap_tests.sqlstate_of(format('select admin_adjust_wallet(%L, 100, '' '', %L)', tap_tests.id('c1'), tap_tests.id('e9')));
  return next is(st, 'P0001', 'a note is required');
  st := tap_tests.sqlstate_of(format('select admin_adjust_wallet(%L, 100, ''x'', %L)', tap_tests.id('c1'), tap_tests.id('a1')));
  return next is(st, '42501', 'a non-admin cannot adjust');
end $$;

create function tap_tests.test_wallet_spam_report() returns setof text language plpgsql as $$
declare st text; rid uuid; amt int;
begin
  perform tap_tests.wallet_fixtures();
  perform place_estimate_hold(tap_tests.id('81'));

  -- Not charged yet: can't report.
  perform tap_tests.login(tap_tests.id('c1'));
  st := tap_tests.sqlstate_of(format('select report_spam_lead(%L, ''fake_couple'')', tap_tests.id('81')));
  perform tap_tests.logout();
  return next is(st, 'P0001', 'an unopened lead cannot be reported');

  perform tap_tests.login(tap_tests.id('a1'));
  perform view_quote(tap_tests.id('81'));
  perform tap_tests.logout();

  -- Another vendor can't report V1's lead.
  perform tap_tests.login(tap_tests.id('c2'));
  st := tap_tests.sqlstate_of(format('select report_spam_lead(%L, ''fake_couple'')', tap_tests.id('81')));
  perform tap_tests.logout();
  return next is(st, '42501', 'only the estimate''s vendor can report');

  perform tap_tests.login(tap_tests.id('c1'));
  rid := report_spam_lead(tap_tests.id('81'), 'fake_couple', 'Phone number is fake');
  st := tap_tests.sqlstate_of(format('select report_spam_lead(%L, ''other'')', tap_tests.id('81')));
  return next is((select count(*)::int from lead_spam_reports), 1, 'vendor sees own report');
  perform tap_tests.logout();
  return next is(st, 'P0001', 'a lead is reported once');

  -- Vendors can't resolve their own report.
  perform tap_tests.login(tap_tests.id('c1'));
  st := tap_tests.sqlstate_of(format('select resolve_spam_report(%L, true, %L)', rid, tap_tests.id('e9')));
  perform tap_tests.logout();
  return next is(st, '42501', 'vendor cannot call resolve_spam_report');

  amt := resolve_spam_report(rid, true, tap_tests.id('e9'));
  return next is(amt, 100, 'approval credits $1');
  return next is(wallet_balance(tap_tests.id('c1')), 1000, 'balance back to $10');
  return next is(credit_lead_charge(tap_tests.id('81'), tap_tests.id('e9'), 'again'), 0, 'a lead is credited once');

  -- Older than 14 days: can't report.
  perform place_estimate_hold(tap_tests.id('82'));
  perform tap_tests.login(tap_tests.id('a1'));
  perform view_quote(tap_tests.id('82'));
  perform tap_tests.logout();
  update vendor_usage set created_at = now() - interval '15 days' where ref_id = tap_tests.id('82')::text;
  perform tap_tests.login(tap_tests.id('c1'));
  st := tap_tests.sqlstate_of(format('select report_spam_lead(%L, ''other'')', tap_tests.id('82')));
  perform tap_tests.logout();
  return next is(st, 'P0001', 'too old to report after 14 days');
end $$;

create function tap_tests.test_wallet_spam_couple() returns setof text language plpgsql as $$
begin
  perform tap_tests.wallet_fixtures();
  perform place_estimate_hold(tap_tests.id('81'));
  perform place_estimate_hold(tap_tests.id('82'));
  perform tap_tests.login(tap_tests.id('a1'));
  perform view_quote(tap_tests.id('81'));
  perform view_quote(tap_tests.id('82'));
  perform tap_tests.logout();
  return next is(wallet_balance(tap_tests.id('c1')), 800, 'two leads charged');
  return next is(credit_spam_couple(tap_tests.id('a1'), tap_tests.id('e9')), 2, 'banning the couple credits both');
  return next is(credit_spam_couple(tap_tests.id('a1'), tap_tests.id('e9')), 0, '... once');
  return next is(wallet_balance(tap_tests.id('c1')), 1000, 'balance restored');
end $$;

create function tap_tests.test_wallet_sms() returns setof text language plpgsql as $$
declare i int;
begin
  -- _setup.sql already records one free text for V1 this month, so 49 more stay free.
  for i in 1..49 loop
    perform record_sms_usage(tap_tests.id('c1'), 200000 + i);
  end loop;
  return next is(wallet_balance(tap_tests.id('c1')), 1000, 'first 50 texts free on Pay as you go');
  return next is(record_sms_usage(tap_tests.id('c1'), 200051), 20, 'text 51 costs 20 cents');
  return next is(wallet_balance(tap_tests.id('c1')), 980, '... from the wallet');

  -- Empty wallet: refused, nothing recorded.
  insert into wallet_transactions (vendor_id, kind, amount_cents, note) values (tap_tests.id('c1'), 'adjust', -980, 'test');
  return next is(record_sms_usage(tap_tests.id('c1'), 200052), -1, 'refused when the wallet cannot cover it');
  return next is((select count(*)::int from vendor_usage where ref_id = '200052'), 0, '... nothing recorded');
  return next is(wallet_balance(tap_tests.id('c1')), 0, 'balance stays at 0');
end $$;

create function tap_tests.test_wallet_access() returns setof text language plpgsql as $$
declare f text; st text; v int;
begin
  -- Server-only functions.
  foreach f in array array[
    format('place_estimate_hold(%L)', tap_tests.id('81')),
    format('release_estimate_hold(%L, ''withdrawn'')', tap_tests.id('81')),
    'release_stale_holds()',
    format('grant_signup_credit(%L)', tap_tests.id('c1')),
    format('credit_wallet(%L, 2000, ''cs_x'')', tap_tests.id('c1')),
    format('admin_adjust_wallet(%L, 100, ''x'', %L)', tap_tests.id('c1'), tap_tests.id('c1')),
    format('credit_lead_charge(%L, null, null)', tap_tests.id('81')),
    format('credit_spam_couple(%L, %L)', tap_tests.id('a1'), tap_tests.id('c1')),
    format('lock_wallet(%L)', tap_tests.id('c1'))
  ] loop
    perform tap_tests.login(tap_tests.id('c1'));
    st := tap_tests.sqlstate_of('select ' || f);
    perform tap_tests.logout();
    return next is(st, '42501', 'vendor cannot call ' || split_part(f, '(', 1));
  end loop;

  -- Tables: vendors read only their own; nobody writes directly.
  perform place_estimate_hold(tap_tests.id('81'));
  perform tap_tests.login(tap_tests.id('c2'));
  v := tap_tests.n('select 1 from wallet_holds');
  return next is(v, 0, 'V2 cannot see V1''s holds');
  return next is(wallet_held(tap_tests.id('c1')), 0, 'V2 sees 0 held for V1');
  perform tap_tests.logout();

  perform tap_tests.login(tap_tests.id('c1'));
  return next is(tap_tests.n('select 1 from wallet_holds'), 1, 'V1 sees own hold');
  st := tap_tests.sqlstate_of(format(
    'update wallet_holds set status = ''released'', release_reason = ''admin'', resolved_at = now() where quote_id = %L',
    tap_tests.id('81')));
  return next is(tap_tests.n('select 1 from wallet_holds where status = ''held'''), 1, 'V1 cannot release own hold');
  st := tap_tests.sqlstate_of('update pricing_config set lead_fee_cents = 0');
  return next is((vendor_pricing(tap_tests.id('c1'))).lead_fee_cents, 100, 'vendors cannot change pricing');
  return next is(tap_tests.n('select 1 from signup_credit_claims'), 0, 'claims are server-only');
  perform tap_tests.logout();

  perform tap_tests.login_anon();
  return next is(tap_tests.n('select 1 from pricing_config'), 1, 'prices are public');
  st := tap_tests.sqlstate_of(format('select report_spam_lead(%L, ''other'')', tap_tests.id('81')));
  perform tap_tests.logout();
  return next is(st, '42501', 'anon cannot report spam');
end $$;

-- Step 4: opening an estimate unlocks the vendor's contact details and, on posted projects, messages.
create function tap_tests.test_estimate_unlock() returns setof text language plpgsql as $$
declare v int; e text;
begin
  update vendors set phone = '704-555-0101', website = 'https://example.com' where id = tap_tests.id('c1');
  update threads set origin = 'post' where id = tap_tests.id('71');

  -- Before opening: no contact for the couple, no messages on a posted project.
  perform tap_tests.login(tap_tests.id('a1'));
  v := tap_tests.n(format('select 1 from thread_vendor_contact(%L)', tap_tests.id('71')));
  return next is(v, 0, 'couple sees no contact before opening an estimate');
  return next is(thread_messaging_open(tap_tests.id('71')), false, 'posted project: messages locked before opening');
  perform tap_tests.logout();

  perform tap_tests.login(tap_tests.id('c1'));
  return next is(thread_messaging_open(tap_tests.id('71')), false, '... for the vendor too');
  v := tap_tests.n(format('select 1 from thread_vendor_contact(%L)', tap_tests.id('71')));
  return next is(v, 1, 'the vendor always sees their own contact card');
  perform tap_tests.logout();

  -- The couple opens the estimate (charged once): unlocked.
  perform tap_tests.login(tap_tests.id('a1'));
  perform view_quote(tap_tests.id('81'));
  select c.email into e from thread_vendor_contact(tap_tests.id('71')) c;
  return next is(e, 'vendor-1@test.invalid', 'couple sees the vendor''s email after opening');
  return next is((select c.phone from thread_vendor_contact(tap_tests.id('71')) c), '704-555-0101', '... and phone');
  return next is(thread_messaging_open(tap_tests.id('71')), true, 'messages open after opening');
  perform tap_tests.logout();

  -- Another couple learns nothing.
  perform tap_tests.login(tap_tests.id('a2'));
  v := tap_tests.n(format('select 1 from thread_vendor_contact(%L)', tap_tests.id('71')));
  return next is(v, 0, 'another couple sees no contact');
  return next is(thread_messaging_open(tap_tests.id('71')), false, '... and no messaging');
  perform tap_tests.logout();

  perform tap_tests.login_anon();
  return next is(tap_tests.sqlstate_of(format('select thread_vendor_contact(%L)', tap_tests.id('71'))), '42501', 'anon cannot ask');
  perform tap_tests.logout();
end $$;

create function tap_tests.test_estimate_unlock_inquiry() returns setof text language plpgsql as $$
begin
  -- A conversation the couple started is open from the start; contact still waits for an open.
  perform tap_tests.login(tap_tests.id('a1'));
  return next is(thread_messaging_open(tap_tests.id('71')), true, 'inquiry: messages open before any estimate is opened');
  return next is(tap_tests.n(format('select 1 from thread_vendor_contact(%L)', tap_tests.id('71'))), 0,
                 'inquiry: contact still waits for an opened estimate');
  perform tap_tests.logout();
end $$;

-- Step 5: a reload records its payment intent; a Stripe refund takes back its pre-tax share.
create function tap_tests.test_wallet_reload_refund() returns setof text language plpgsql as $$
declare st text;
begin
  perform credit_wallet(tap_tests.id('c1'), 4000, 'cs_r1', 'pi_r1');          -- $40 (+ tax at Stripe)
  return next is(wallet_balance(tap_tests.id('c1')), 5000, '$40 reload credited');
  return next is(refund_wallet_payment('pi_unknown', 4280, 4280), null, 'not a wallet payment: null');

  -- Half the charge (tax included) refunded: $20 back off the wallet.
  return next is(refund_wallet_payment('pi_r1', 4280, 2140), 2000, 'half refunded: $20 debited');
  return next is(refund_wallet_payment('pi_r1', 4280, 2140), 0, 'same event again: nothing more');
  return next is(refund_wallet_payment('pi_r1', 4280, 4280), 2000, 'rest refunded: the other $20');
  return next is(wallet_balance(tap_tests.id('c1')), 1000, 'back to $10');

  -- Credit already spent stays spent: never below $0 available.
  perform credit_wallet(tap_tests.id('c1'), 2000, 'cs_r2', 'pi_r2');
  insert into wallet_transactions (vendor_id, kind, amount_cents, note) values (tap_tests.id('c1'), 'adjust', -2700, 'spent');
  -- balance 300, $1 on hold for quote 81 -> available 200
  return next is(refund_wallet_payment('pi_r2', 2140, 2140), 200, 'debits only what is available');
  return next is(wallet_available(tap_tests.id('c1')), 0, 'available is 0, not negative');

  perform tap_tests.login(tap_tests.id('c1'));
  st := tap_tests.sqlstate_of('select refund_wallet_payment(''pi_r1'', 1, 1)');
  perform tap_tests.logout();
  return next is(st, '42501', 'vendors cannot call refund_wallet_payment');
end $$;

-- Step 6: Account page data and low-balance alerts.
create function tap_tests.test_wallet_account() returns setof text language plpgsql as $$
declare r record; n int;
begin
  perform tap_tests.login(tap_tests.id('c1'));
  select * into r from wallet_summary();
  perform tap_tests.logout();
  return next is(r.balance_cents, 1000, 'summary: balance');
  return next is(r.held_cents, 100, 'summary: $1 on hold for quote 81');
  return next is(r.available_cents, 900, 'summary: available');
  return next is(r.can_reload, false, 'summary: no reload at $10');
  return next is(r.sms_used_this_month, 1, 'summary: texts this month');

  perform tap_tests.login(tap_tests.id('a1'));
  perform view_quote(tap_tests.id('81'));
  perform tap_tests.logout();

  perform tap_tests.login(tap_tests.id('c1'));
  select * into r from wallet_activity() limit 1;
  n := tap_tests.n('select 1 from wallet_activity(''reloads'')');
  perform tap_tests.logout();
  return next is(r.kind, 'estimate_view', 'activity: newest first');
  return next is(r.amount_cents, -100, '... the $1 lead');
  return next is(r.couple_first_name, 'Priya', '... couple first name only');
  return next is(r.wedding_month, 'Oct 2027', '... and wedding month');
  return next is(r.thread_id, tap_tests.id('71'), '... links to the conversation');
  return next is(r.total_count, 2::bigint, 'activity: total count for paging');
  return next is(n, 1, 'filter: reloads');

  -- Another vendor sees none of it.
  perform tap_tests.login(tap_tests.id('c2'));
  return next is(tap_tests.n('select 1 from wallet_activity()'), 0, 'V2 sees none of V1''s activity');
  perform tap_tests.logout();
end $$;

create function tap_tests.test_wallet_alerts() returns setof text language plpgsql as $$
declare st text;
begin
  return next is(take_wallet_alert(tap_tests.id('c1')), 'low', '$9 available: low alert');
  return next is(take_wallet_alert(tap_tests.id('c1')), null, '... once per 24 hours');
  insert into wallet_transactions (vendor_id, kind, amount_cents, note) values (tap_tests.id('c1'), 'adjust', -850, 'test');
  return next is(take_wallet_alert(tap_tests.id('c1')), 'empty', '$0.50 available: empty alert');
  return next is(take_wallet_alert(tap_tests.id('c1')), null, '... once per 24 hours');
  update wallet_alerts set sent_at = now() - interval '25 hours';
  return next is(take_wallet_alert(tap_tests.id('c1')), 'empty', 'again after 24 hours');
  return next is(take_wallet_alert(tap_tests.id('c2')), null, 'Basic vendors get no wallet alerts');

  perform tap_tests.login(tap_tests.id('c1'));
  st := tap_tests.sqlstate_of(format('select take_wallet_alert(%L)', tap_tests.id('c1')));
  return next is(tap_tests.n('select 1 from wallet_alerts'), 0, 'alerts table is server-only');
  perform tap_tests.logout();
  return next is(st, '42501', 'vendors cannot call take_wallet_alert');
end $$;

-- Step 7: the Account activity says which leads can still be reported, and the report's status.
create function tap_tests.test_wallet_activity_reports() returns setof text language plpgsql as $$
declare r record; rid uuid;
begin
  perform tap_tests.wallet_fixtures();
  perform tap_tests.login(tap_tests.id('a1'));
  perform view_quote(tap_tests.id('81'));
  perform tap_tests.logout();

  perform tap_tests.login(tap_tests.id('c1'));
  select * into r from wallet_activity('leads') limit 1;
  return next is(r.can_report, true, 'a fresh charged lead can be reported');
  return next is(r.report_status, null, '... no report yet');
  rid := report_spam_lead(tap_tests.id('81'), 'fake_couple');
  select * into r from wallet_activity('leads') limit 1;
  return next is(r.can_report, false, 'not again once reported');
  return next is(r.report_status, 'pending', '... shows pending');
  perform tap_tests.logout();

  perform resolve_spam_report(rid, true, tap_tests.id('e9'));
  perform tap_tests.login(tap_tests.id('c1'));
  select * into r from wallet_activity('leads') limit 1;
  return next is(r.report_status, 'approved', 'shows approved after review');
  return next is((select count(*)::int from wallet_activity('credits') a where a.kind = 'lead_credit'), 1, 'the credit is in the activity');
  perform tap_tests.logout();

  update vendor_usage set created_at = now() - interval '15 days';
  update wallet_transactions set created_at = now() - interval '15 days' where kind = 'estimate_view';
  delete from lead_spam_reports;
  delete from wallet_transactions where kind = 'lead_credit';
  perform tap_tests.login(tap_tests.id('c1'));
  return next is((select a.can_report from wallet_activity('leads') a limit 1), false, 'not after 14 days');
  perform tap_tests.logout();
end $$;

select * from runtests('tap_tests'::name, '^test_');
