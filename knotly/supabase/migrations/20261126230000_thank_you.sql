-- Thank-You Tracker add-on ($5): a gift log per household, thank-you status, address labels.
-- Gifts can be pulled in from the Registry (claims and "I sent a gift" notes) or added by hand.

create table thank_you_gifts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references couple_projects on delete cascade,
  household_id uuid references guest_households on delete set null,
  giver text check (char_length(giver) <= 80),            -- when it isn't (yet) matched to a household
  description text not null check (char_length(description) between 1 and 200),
  amount_cents int check (amount_cents between 0 and 100000000),
  received_on date,
  thanked_on date,
  notes text check (char_length(notes) <= 500),
  source text not null default 'manual' check (source in ('manual', 'registry_claim', 'gift_note')),
  source_id uuid,
  created_at timestamptz not null default now(),
  check (household_id is not null or giver is not null)
);
create unique index thank_you_source on thank_you_gifts (source, source_id) where source_id is not null;
create index thank_you_project on thank_you_gifts (project_id, created_at desc);

create function thank_you_cap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from thank_you_gifts where project_id = new.project_id) >= 2000 then
    raise exception 'gift_limit: up to 2,000 gifts';
  end if;
  return new;
end $$;
create trigger thank_you_cap before insert on thank_you_gifts for each row execute function thank_you_cap();

alter table thank_you_gifts enable row level security;
create policy "own gifts read" on thank_you_gifts for select using (owns_project(project_id));
create policy "own gifts insert" on thank_you_gifts for insert
  with check (owns_project(project_id) and has_addon(project_id, 'thank_you')
              and (household_id is null or exists (select 1 from guest_households h where h.id = household_id and h.project_id = thank_you_gifts.project_id)));
create policy "own gifts update" on thank_you_gifts for update
  using (owns_project(project_id) and has_addon(project_id, 'thank_you'))
  with check (owns_project(project_id)
              and (household_id is null or exists (select 1 from guest_households h where h.id = household_id and h.project_id = thank_you_gifts.project_id)));
create policy "own gifts delete" on thank_you_gifts for delete using (owns_project(project_id));
