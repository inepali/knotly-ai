-- MVP Phase 0 (spec §9): guests (CG-1), wedding website + RSVP (CG-2), registry (CG-3),
-- Help assistant usage cap (CH-1). Public pages read only through security-definer functions.

create table guests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references couple_projects on delete cascade,
  household text,
  first_name text not null,
  last_name text,
  email text,
  phone text,
  side text,
  tags text[] not null default '{}',
  plus_one_allowed boolean not null default false,
  plus_one_name text,
  rsvp text not null default 'awaiting' check (rsvp in ('awaiting', 'attending', 'declined')),
  meal text,
  dietary text,
  table_name text,
  rsvp_at timestamptz,
  created_at timestamptz default now()
);
create index on guests (project_id);

create table wedding_websites (
  project_id uuid primary key references couple_projects on delete cascade,
  slug text unique not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),  -- knotly.net/w/<slug>
  template text not null default 'classic',
  sections jsonb not null default '{}',        -- {"story":{"on":true,"text":"..."},"schedule":{...},...}
  cover_path text,                             -- in the website-covers bucket
  password_hash text,                          -- set only through set_website_password()
  published boolean not null default false,
  updated_at timestamptz default now()
);
create trigger wedding_websites_touch before update on wedding_websites
  for each row execute function touch_updated_at();

create table registry_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references couple_projects on delete cascade,
  kind text not null default 'store' check (kind in ('store', 'cash_fund')),
  title text not null,
  url text check (url is null or url ~* '^https?://'),
  note text,
  sort int not null default 0
);
create index on registry_links (project_id);

create table help_usage (
  profile_id uuid references profiles on delete cascade,
  day date not null default current_date,
  messages int not null default 0,
  primary key (profile_id, day)
);

alter table guests enable row level security;
alter table wedding_websites enable row level security;
alter table registry_links enable row level security;
alter table help_usage enable row level security;

create policy "couple manages own guests" on guests for all to authenticated
  using (owns_project(project_id)) with check (owns_project(project_id));
create policy "couple manages own website" on wedding_websites for all to authenticated
  using (owns_project(project_id)) with check (owns_project(project_id));
create policy "couple manages own registry" on registry_links for all to authenticated
  using (owns_project(project_id)) with check (owns_project(project_id));
-- Read only: the count goes up through take_help_message(), so the cap can't be reset.
create policy "read own help usage" on help_usage for select to authenticated
  using (profile_id = auth.uid());

-- The couple can't write the hash directly; the password is hashed here.
revoke insert, update on wedding_websites from authenticated, anon;
grant insert (project_id, slug, template, sections, cover_path, published) on wedding_websites to authenticated;
grant update (slug, template, sections, cover_path, published) on wedding_websites to authenticated;

create function set_website_password(p_project uuid, p_password text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not owns_project(p_project) then
    raise exception 'not your wedding';
  end if;
  update wedding_websites
     set password_hash = case when coalesce(p_password, '') = '' then null
                              else crypt(p_password, gen_salt('bf')) end
   where project_id = p_project;
end $$;
revoke execute on function set_website_password from public, anon;
grant execute on function set_website_password to authenticated;

-- Help assistant: 30 messages per couple per day (CLAUDE.md cost rules). Counts one message
-- and returns true, or returns false once the day's cap is reached.
create function take_help_message() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  if auth.uid() is null then
    return false;
  end if;
  insert into help_usage (profile_id, day, messages) values (auth.uid(), current_date, 1)
  on conflict (profile_id, day) do update set messages = help_usage.messages + 1
    where help_usage.messages < 30
  returning messages into v_count;
  return v_count is not null;
end $$;
revoke execute on function take_help_message from public, anon;
grant execute on function take_help_message to authenticated;

-- Public website ----------------------------------------------------------------------------
-- Returns null if the site doesn't exist or isn't published; {"locked":true} if a password is
-- set and doesn't match. Never returns guest data.
create function public_website(p_slug text, p_password text default null) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  w wedding_websites;
  p couple_projects;
begin
  select * into w from wedding_websites where slug = p_slug and published;
  if w.project_id is null then
    return null;
  end if;
  if w.password_hash is not null
     and (p_password is null or crypt(p_password, w.password_hash) <> w.password_hash) then
    return jsonb_build_object('locked', true);
  end if;
  select * into p from couple_projects where id = w.project_id;
  return jsonb_build_object(
    'locked', false,
    'slug', w.slug,
    'template', w.template,
    'sections', w.sections,
    'cover_path', w.cover_path,
    'partner_names', p.partner_names,
    'wedding_date', p.wedding_date,
    'venue', p.venue,
    'venue_address', p.venue_address,
    'schedule', coalesce((
      select jsonb_agg(jsonb_build_object('starts_at', t.starts_at, 'duration_min', t.duration_min,
                                          'title', t.title, 'location', t.location)
                       order by t.starts_at, t.sort)
        from timeline_events t
       where t.project_id = w.project_id and t.visibility = 'everyone'), '[]'),
    'registry', coalesce((
      select jsonb_agg(jsonb_build_object('kind', r.kind, 'title', r.title, 'url', r.url, 'note', r.note)
                       order by r.sort)
        from registry_links r where r.project_id = w.project_id), '[]')
  );
end $$;
grant execute on function public_website to anon, authenticated;

-- RSVP: the guest finds themselves by name (household-aware). Returns the matching guests in
-- that household (first names only) so the form can answer for each, without listing the
-- whole guest list. A match needs first + last name, case-insensitive.
create function find_rsvp(p_slug text, p_password text, p_first text, p_last text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  w wedding_websites;
  g guests;
begin
  select * into w from wedding_websites where slug = p_slug and published;
  if w.project_id is null
     or (w.password_hash is not null
         and (p_password is null or crypt(p_password, w.password_hash) <> w.password_hash)) then
    return null;
  end if;
  select * into g from guests
   where project_id = w.project_id
     and lower(trim(first_name)) = lower(trim(p_first))
     and lower(trim(coalesce(last_name, ''))) = lower(trim(coalesce(p_last, '')))
   limit 1;
  if g.id is null then
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object('found', true, 'guests', (
    select jsonb_agg(jsonb_build_object('id', x.id, 'first_name', x.first_name, 'rsvp', x.rsvp,
                                        'plus_one_allowed', x.plus_one_allowed) order by x.first_name)
      from guests x
     where x.project_id = w.project_id
       and (x.id = g.id or (g.household is not null and x.household = g.household))));
end $$;
grant execute on function find_rsvp to anon, authenticated;

-- Save one guest's answer. The guest id must belong to this site's wedding.
create function submit_rsvp(
  p_slug text, p_password text, p_guest uuid, p_rsvp text,
  p_meal text default null, p_dietary text default null, p_plus_one_name text default null
) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  w wedding_websites;
begin
  if p_rsvp not in ('attending', 'declined') then
    raise exception 'rsvp must be attending or declined';
  end if;
  select * into w from wedding_websites where slug = p_slug and published;
  if w.project_id is null
     or (w.password_hash is not null
         and (p_password is null or crypt(p_password, w.password_hash) <> w.password_hash)) then
    return false;
  end if;
  update guests
     set rsvp = p_rsvp,
         meal = left(p_meal, 100),
         dietary = left(p_dietary, 500),
         plus_one_name = case when plus_one_allowed then left(p_plus_one_name, 100) else plus_one_name end,
         rsvp_at = now()
   where id = p_guest and project_id = w.project_id;
  return found;
end $$;
grant execute on function submit_rsvp to anon, authenticated;

-- Read-only wedding-day timeline for the wedding party (CO-3 share link).
create function shared_timeline(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'partner_names', p.partner_names,
    'wedding_date', p.wedding_date,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('starts_at', t.starts_at, 'duration_min', t.duration_min,
                                          'title', t.title, 'location', t.location, 'notes', t.notes)
                       order by t.starts_at, t.sort)
        from timeline_events t
       where t.project_id = p.id and t.visibility in ('everyone', 'party')), '[]'))
  from couple_projects p
  where p.timeline_share_token = p_token;
$$;
grant execute on function shared_timeline to anon, authenticated;
