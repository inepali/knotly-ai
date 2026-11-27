-- MVP Phase 0 (spec §9, GAP_ANALYSIS §3.1): additive columns on existing tables, with backfills.
-- Nothing is dropped or renamed. Old columns (budget_items.planned, vendor_packages.inclusions,
-- couple_projects.needs) stay until the UI has moved off them.

-- Couple-owned rows check this in RLS. Security definer so policies on other tables
-- don't recurse through couple_projects' own policies.
create function owns_project(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from couple_projects where id = p and couple_id = auth.uid());
$$;

-- Profiles ------------------------------------------------------------------------------
alter table profiles
  add column phone_verified boolean not null default false,  -- set by the server after an OTP
  add column sms_opt_in_at timestamptz,                      -- null = no texts; set/cleared by the server (STOP)
  add column notify_prefs jsonb not null default '{}';

grant update (notify_prefs) on profiles to authenticated;

-- Couple projects -----------------------------------------------------------------------
alter table couple_projects
  add column venue_address text,
  add column calendar_token uuid not null default gen_random_uuid() unique,       -- ICS feed (CO-4)
  add column timeline_share_token uuid not null default gen_random_uuid() unique; -- read-only timeline link (CO-3)

-- Vendors -------------------------------------------------------------------------------
alter table vendors
  add column slug text unique,                                -- knotly.net/v/<slug>
  add column phone text,
  add column instagram text,
  add column photos text[] not null default '{}',             -- paths in the vendor-photos bucket
  add column plan text not null default 'payg' check (plan in ('basic', 'pro', 'payg')),
  add column plan_renews_at date,
  add column stripe_customer_id text unique,
  add column stripe_subscription_id text unique,
  add column subscription_status text;                        -- active, past_due, canceled (from webhooks)

create function slugify(t text) returns text
language sql immutable set search_path = public as $$
  select nullif(trim(both '-' from regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', '-', 'g')), '');
$$;

-- New vendors get a unique slug from their business name: golden-hour-co, golden-hour-co-2, ...
-- Security definer so the uniqueness check sees unpublished vendors too.
create function set_vendor_slug() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text := coalesce(slugify(new.business_name), 'vendor');
  candidate text := base;
  n int := 1;
begin
  while exists (select 1 from vendors where slug = candidate and id <> new.id) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  new.slug := candidate;
  return new;
end $$;

create trigger set_vendor_slug before insert or update on vendors
  for each row when (new.slug is null) execute function set_vendor_slug();

-- Backfill one row at a time so each vendor sees the slugs given before it (oldest first).
do $$
declare r record;
begin
  for r in select id from vendors where slug is null order by updated_at nulls last, id loop
    update vendors set slug = null where id = r.id;
  end loop;
end $$;

-- Packages (no-haggle: fixed price + deliverables) ---------------------------------------
alter table vendor_packages
  add column hours numeric,
  add column retainer_amount int check (retainer_amount >= 0),  -- contract text only; Knotly never collects payments
  add column deliverables jsonb not null default '[]',          -- [{"item":"Edited photos","qty":"400+","delivery":"6 weeks"}]
  add column active boolean not null default true,
  add column sort int not null default 0;

update vendor_packages p
   set deliverables = coalesce(
         (select jsonb_agg(jsonb_build_object('item', i, 'qty', null, 'delivery', null))
            from unnest(p.inclusions) i),
         '[]')
 where p.deliverables = '[]';

update vendor_packages p set sort = s.rn
  from (select id, row_number() over (partition by vendor_id order by price, name) - 1 as rn
          from vendor_packages) s
 where s.id = p.id;

-- Agent settings ------------------------------------------------------------------------
alter table vendor_agent_settings
  add column contract_days int not null default 7,
  add column auto_countersign boolean not null default true,
  add column followup_days int[] not null default '{3,7}',
  add column kb_answer_threshold numeric not null default 0.85,
  add column kb_ai_threshold numeric not null default 0.70,
  add column min_notice_days int not null default 14,
  add column quiet_hours jsonb,                               -- {"start":"21:00","end":"08:00","tz":"America/New_York"}
  add column sms_enabled boolean not null default false,
  add column paused boolean not null default false;

-- Links to bookings (foreign keys added once bookings exists, next migration) -------------
alter table threads add column booking_id uuid;
alter table testimonials
  add column booking_id uuid,
  add column review_token uuid unique;
alter table quotes add column booking_id uuid;
alter table vendor_availability add column booking_id uuid;

-- Budget (CO-1): estimated / booked / paid ------------------------------------------------
-- `estimated` is the spec's name for `planned`. Both stay in sync until the old Budget tab
-- and assistant tools stop writing `planned`. `label` stays nullable for now: the existing
-- upsert keys on (project_id, category, label) with label null.
alter table budget_items
  add column estimated int not null default 0 check (estimated >= 0),
  add column paid int not null default 0 check (paid >= 0),
  add column source text not null default 'manual' check (source in ('manual', 'default', 'booking')),
  add column booking_id uuid;

update budget_items
   set estimated = coalesce(planned, 0),
       source = case when planned_by = 'ai' then 'default' else 'manual' end;

create function sync_budget_estimate() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.planned is not null and new.estimated = 0 then
      new.estimated := new.planned;
    elsif new.planned is null and new.estimated <> 0 then
      new.planned := new.estimated;
    end if;
  elsif new.planned is distinct from old.planned then
    new.estimated := coalesce(new.planned, 0);
  elsif new.estimated is distinct from old.estimated then
    new.planned := new.estimated;
  end if;
  return new;
end $$;

create trigger sync_budget_estimate before insert or update on budget_items
  for each row execute function sync_budget_estimate();
