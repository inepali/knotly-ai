-- Couple add-ons: a priced catalog, what each wedding (project) owns, payments and Stripe webhook de-dupe.
-- Paid once per wedding; active until 90 days after the wedding date (see client-add-ons-spec.md).
-- Guest List is free and is not in the catalog: has_addon() always answers true for it.

create table addon_catalog (
  key text primary key,
  name text not null,
  blurb text not null default '',
  price_cents int not null check (price_cents >= 0),
  kind text not null default 'one_time' check (kind in ('one_time', 'bundle')),
  includes text[] not null default '{}',  -- bundles: the add-on keys they unlock
  requires text[] not null default '{}',  -- paid add-ons that must be owned too
  active boolean not null default true,
  sort int not null default 0
);

insert into addon_catalog (key, name, blurb, price_cents, kind, includes, requires, sort) values
  ('website',     'Wedding Website',              'A one-page site for your guests: story, schedule, travel, FAQ.', 500, 'one_time', '{}', '{}', 10),
  ('rsvp',        'RSVP',                         'Guests RSVP online with meals, dietary notes and plus-ones.',      500, 'one_time', '{}', '{website}', 20),
  ('registry',    'Gift Registry',                'Store registry links, cash and honeymoon funds, wish items.',     500, 'one_time', '{}', '{website}', 30),
  ('invitations', 'Save-the-Dates & Invitations', 'Email invites with personal RSVP links, plus a printable PDF.',   500, 'one_time', '{}', '{}', 40),
  ('seating',     'Seating Chart',                'Tables, drag-and-drop guests, printable seating plan.',           500, 'one_time', '{}', '{}', 50),
  ('photo_share', 'Guest Photo Sharing',          'A QR code at the venue so guests can share their photos.',         500, 'one_time', '{}', '{}', 60),
  ('thank_you',   'Thank-You Tracker',            'Track gifts and thank-you notes, print address labels.',          500, 'one_time', '{}', '{}', 70),
  ('bundle_essentials', 'Essentials bundle', 'Website, RSVP, Registry and Invitations.', 1500, 'bundle',
     '{website,rsvp,registry,invitations}', '{}', 100),
  ('bundle_all', 'Everything bundle', 'All seven add-ons.', 2900, 'bundle',
     '{website,rsvp,registry,invitations,seating,photo_share,thank_you}', '{}', 110);

-- What a wedding owns. Belongs to the project, so both partners share it later.
create table couple_addons (
  project_id uuid not null references couple_projects on delete cascade,
  addon_key text not null references addon_catalog,
  source text not null check (source in ('purchase', 'bundle', 'promo', 'admin')),
  stripe_session_id text,
  active_until timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (project_id, addon_key)
);
create index couple_addons_session on couple_addons (stripe_session_id);

create table couple_payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references couple_projects on delete cascade,
  stripe_session_id text not null unique,
  stripe_payment_intent text,
  keys text[] not null,
  amount_cents int not null,
  tax_cents int not null default 0,
  status text not null default 'paid' check (status in ('paid', 'refunded')),
  created_at timestamptz not null default now(),
  refunded_at timestamptz
);
create index couple_payments_intent on couple_payments (stripe_payment_intent);

-- Stripe event ids already handled (webhooks can be delivered more than once).
create table stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

alter table addon_catalog enable row level security;
alter table couple_addons enable row level security;
alter table couple_payments enable row level security;
alter table stripe_events enable row level security;  -- service role only (no policies)

create policy "catalog is public" on addon_catalog for select using (active);
create policy "own add-ons" on couple_addons for select
  using (exists (select 1 from couple_projects p where p.id = project_id and p.couple_id = auth.uid()));
create policy "own payments" on couple_payments for select
  using (exists (select 1 from couple_projects p where p.id = project_id and p.couple_id = auth.uid()));
-- No insert/update/delete policies: only grant_addons / revoke_addons_for_payment write these.

-- When an add-on stops being editable: 90 days after the wedding, or 18 months out with no date;
-- never sooner than 30 days after purchase.
create function addon_active_until(p_project uuid, p_bought timestamptz default now())
returns timestamptz language sql stable security definer set search_path = public as $$
  select greatest(
    p_bought + interval '30 days',
    coalesce((select (wedding_date + 90)::timestamptz from couple_projects where id = p_project),
             p_bought + interval '18 months'))
$$;

-- Does this wedding have an active add-on? Used by RLS on add-on tables and by public pages.
create function has_addon(p_project uuid, p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_key = 'guest_list' or exists (
    select 1 from couple_addons
    where project_id = p_project and addon_key = p_key and active_until > now())
$$;

-- Called by the Stripe webhook (service role). Idempotent on the Checkout Session id.
create function grant_addons(
  p_project uuid, p_keys text[], p_session text, p_intent text, p_amount int, p_tax int
) returns text[] language plpgsql security definer set search_path = public as $$
declare
  k text;
  granted text[] := '{}';
  until timestamptz := addon_active_until(p_project);
begin
  if exists (select 1 from couple_payments where stripe_session_id = p_session) then
    return granted;  -- already handled
  end if;

  insert into couple_payments (project_id, stripe_session_id, stripe_payment_intent, keys, amount_cents, tax_cents)
  values (p_project, p_session, p_intent, p_keys, p_amount, coalesce(p_tax, 0));

  for k in
    select unnest(c.includes) from addon_catalog c where c.key = any(p_keys) and c.kind = 'bundle'
    union
    select c.key from addon_catalog c where c.key = any(p_keys) and c.kind = 'one_time'
  loop
    insert into couple_addons (project_id, addon_key, source, stripe_session_id, active_until)
    values (p_project, k,
            case when k = any(p_keys) then 'purchase' else 'bundle' end,
            p_session, until)
    on conflict (project_id, addon_key) do update
      set active_until = greatest(couple_addons.active_until, excluded.active_until),
          stripe_session_id = excluded.stripe_session_id,
          source = excluded.source;
    granted := granted || k;
  end loop;
  return granted;
end $$;

-- Called by the Stripe webhook on a refund: take back what that payment unlocked.
create function revoke_addons_for_payment(p_intent text) returns int
language plpgsql security definer set search_path = public as $$
declare
  s text;
  n int := 0;
begin
  for s in
    update couple_payments set status = 'refunded', refunded_at = now()
    where stripe_payment_intent = p_intent and status = 'paid'
    returning stripe_session_id
  loop
    delete from couple_addons where stripe_session_id = s;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function grant_addons(uuid, text[], text, text, int, int) from public, anon, authenticated;
revoke all on function revoke_addons_for_payment(text) from public, anon, authenticated;
grant execute on function grant_addons(uuid, text[], text, text, int, int) to service_role;
grant execute on function revoke_addons_for_payment(text) to service_role;
revoke all on function has_addon(uuid, text) from public, anon;
grant execute on function has_addon(uuid, text) to authenticated, service_role;

-- A new wedding date moves the access window with it.
create function refresh_addon_window() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update couple_addons
    set active_until = addon_active_until(new.id, created_at)
    where project_id = new.id and source in ('purchase', 'bundle');
  return new;
end $$;
create trigger on_wedding_date_change after update of wedding_date on couple_projects
  for each row when (old.wedding_date is distinct from new.wedding_date)
  execute function refresh_addon_window();
