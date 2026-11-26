-- Guest List (free): households (the invitation unit) with their guests, and the wedding's events
-- (ceremony, reception, rehearsal…) so each household can be invited to some or all of them.
-- Couple-only: guests' details are never visible to vendors.

create table wedding_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references couple_projects on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  starts_at timestamptz,
  venue text check (char_length(venue) <= 120),
  address text check (char_length(address) <= 200),
  notes text check (char_length(notes) <= 500),
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index wedding_events_project on wedding_events (project_id, sort);

create table guest_households (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references couple_projects on delete cascade,
  label text not null check (char_length(label) between 1 and 120),   -- "The Patels", "Sam & Jo"
  side text not null default 'both' check (side in ('a', 'b', 'both')),
  tags text[] not null default '{}',
  plus_ones int not null default 0 check (plus_ones between 0 and 5),
  address jsonb not null default '{}',   -- { street, city, state, zip }
  notes text check (char_length(notes) <= 500),
  invite_token uuid not null unique default gen_random_uuid(),  -- personal RSVP link later
  created_at timestamptz not null default now()
);
create index guest_households_project on guest_households (project_id);

create table guests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references guest_households on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 60),
  last_name text not null default '' check (char_length(last_name) <= 60),
  is_child boolean not null default false,
  email text check (char_length(email) <= 254),
  phone text check (char_length(phone) <= 30),
  sort int not null default 0
);
create index guests_household on guests (household_id, sort);

create table guest_event_invites (
  household_id uuid not null references guest_households on delete cascade,
  event_id uuid not null references wedding_events on delete cascade,
  primary key (household_id, event_id)
);

-- Owner check shared by the policies below.
create function owns_project(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from couple_projects where id = p_project and couple_id = auth.uid())
$$;
revoke all on function owns_project(uuid) from public, anon;
grant execute on function owns_project(uuid) to authenticated;

alter table wedding_events enable row level security;
alter table guest_households enable row level security;
alter table guests enable row level security;
alter table guest_event_invites enable row level security;

create policy "own events" on wedding_events for all
  using (owns_project(project_id)) with check (owns_project(project_id));
create policy "own households" on guest_households for all
  using (owns_project(project_id)) with check (owns_project(project_id));
create policy "own guests" on guests for all
  using (exists (select 1 from guest_households h where h.id = household_id and owns_project(h.project_id)))
  with check (exists (select 1 from guest_households h where h.id = household_id and owns_project(h.project_id)));
create policy "own invites" on guest_event_invites for all
  using (exists (select 1 from guest_households h where h.id = household_id and owns_project(h.project_id)))
  with check (
    exists (select 1 from guest_households h join wedding_events e on e.project_id = h.project_id
            where h.id = household_id and e.id = event_id and owns_project(h.project_id)));

-- At most 1,000 guests per wedding.
create function guest_cap() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from guests g join guest_households h on h.id = g.household_id
    where h.project_id = (select project_id from guest_households where id = new.household_id);
  if n >= 1000 then
    raise exception 'guest_limit: A guest list can have up to 1,000 guests.';
  end if;
  return new;
end $$;
create trigger guests_cap before insert on guests for each row execute function guest_cap();
