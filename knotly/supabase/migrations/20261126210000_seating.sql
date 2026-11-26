-- Seating Chart add-on ($5): tables and who sits at each. A seat is a guest, or one of a household's
-- plus-ones (by index), so plus-ones from RSVP can be seated too.

create table seating_tables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references couple_projects on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  shape text not null default 'round' check (shape in ('round', 'long')),
  capacity int not null default 8 check (capacity between 1 and 40),
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index seating_tables_project on seating_tables (project_id, sort);

create table seating_assignments (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references seating_tables on delete cascade,
  household_id uuid not null references guest_households on delete cascade,
  guest_id uuid references guests on delete cascade,
  plus_index int check (plus_index between 0 and 4),
  check ((guest_id is null) <> (plus_index is null))
);
create unique index seating_one_seat on seating_assignments
  (household_id, coalesce(guest_id::text, 'p' || plus_index::text));

create function seating_table_cap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from seating_tables where project_id = new.project_id) >= 100 then
    raise exception 'seating_limit: up to 100 tables';
  end if;
  return new;
end $$;
create trigger seating_tables_cap before insert on seating_tables for each row execute function seating_table_cap();

alter table seating_tables enable row level security;
alter table seating_assignments enable row level security;

create policy "own tables read" on seating_tables for select using (owns_project(project_id));
create policy "own tables insert" on seating_tables for insert with check (owns_project(project_id) and has_addon(project_id, 'seating'));
create policy "own tables update" on seating_tables for update
  using (owns_project(project_id) and has_addon(project_id, 'seating')) with check (owns_project(project_id));
create policy "own tables delete" on seating_tables for delete using (owns_project(project_id));

-- The table and the household must belong to the same wedding.
create function seat_ok(p_table uuid, p_household uuid, p_write boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from seating_tables t join guest_households h on h.project_id = t.project_id
    where t.id = p_table and h.id = p_household and owns_project(t.project_id)
      and (not p_write or has_addon(t.project_id, 'seating')))
$$;
revoke all on function seat_ok(uuid, uuid, boolean) from public, anon;
grant execute on function seat_ok(uuid, uuid, boolean) to authenticated;

create policy "own seats read" on seating_assignments for select using (seat_ok(table_id, household_id, false));
create policy "own seats insert" on seating_assignments for insert with check (seat_ok(table_id, household_id, true));
create policy "own seats update" on seating_assignments for update
  using (seat_ok(table_id, household_id, true)) with check (seat_ok(table_id, household_id, true));
create policy "own seats delete" on seating_assignments for delete using (seat_ok(table_id, household_id, false));
