-- RSVP add-on ($5): guests answer on the wedding website, per person and per event.
-- Public reads/writes happen only on the server (service role) after the household's personal
-- token is checked; there are no anon policies. The couple reads everything for their wedding.

create table rsvp_settings (
  project_id uuid primary key references couple_projects on delete cascade,
  deadline date,
  meal_options jsonb not null default '[]',   -- ["Chicken", "Fish", "Vegetarian"]
  questions jsonb not null default '[]',      -- [{ id, label }] up to 3 extra questions
  require_code boolean not null default false,
  ask_dietary boolean not null default true,
  ask_song boolean not null default false,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(meal_options) = 'array' and jsonb_array_length(meal_options) <= 8),
  check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) <= 3)
);

-- One answer per guest per event. event_id is null when the wedding has no events set up.
create table rsvp_responses (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guests on delete cascade,
  event_id uuid references wedding_events on delete cascade,
  status text not null check (status in ('attending', 'declined')),
  meal text check (char_length(meal) <= 60),
  dietary text check (char_length(dietary) <= 200),
  responded_at timestamptz not null default now()
);
create unique index rsvp_responses_one on rsvp_responses
  (guest_id, coalesce(event_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- What a household answered as a whole: plus-ones, extra questions, song, note; and reminders.
create table rsvp_households (
  household_id uuid primary key references guest_households on delete cascade,
  plus_ones jsonb not null default '[]',  -- [{ name, meal }]
  answers jsonb not null default '{}',    -- { questionId: text }
  song text check (char_length(song) <= 120),
  note text check (char_length(note) <= 1000),
  responded_at timestamptz,
  reminders_sent int not null default 0 check (reminders_sent between 0 and 2),
  last_reminded_at timestamptz,
  check (jsonb_typeof(plus_ones) = 'array' and jsonb_array_length(plus_ones) <= 5)
);

-- A short code guests can type when the couple turns on "require a code" (printed on invitations).
alter table guest_households
  add column rsvp_code text generated always as (upper(substr(replace(invite_token::text, '-', ''), 1, 6))) stored;

alter table rsvp_settings enable row level security;
alter table rsvp_responses enable row level security;
alter table rsvp_households enable row level security;

create policy "own rsvp settings read" on rsvp_settings for select using (owns_project(project_id));
create policy "own rsvp settings write" on rsvp_settings for insert
  with check (owns_project(project_id) and has_addon(project_id, 'rsvp'));
create policy "own rsvp settings update" on rsvp_settings for update
  using (owns_project(project_id) and has_addon(project_id, 'rsvp'))
  with check (owns_project(project_id) and has_addon(project_id, 'rsvp'));

create policy "own rsvp responses" on rsvp_responses for select
  using (exists (select 1 from guests g join guest_households h on h.id = g.household_id
                 where g.id = guest_id and owns_project(h.project_id)));
create policy "own rsvp households" on rsvp_households for select
  using (exists (select 1 from guest_households h where h.id = household_id and owns_project(h.project_id)));
-- Reminder bookkeeping is updated by the couple's own reminder action.
create policy "own rsvp households remind" on rsvp_households for update
  using (exists (select 1 from guest_households h where h.id = household_id and owns_project(h.project_id) and has_addon(h.project_id, 'rsvp')))
  with check (exists (select 1 from guest_households h where h.id = household_id and owns_project(h.project_id)));
create policy "own rsvp households insert" on rsvp_households for insert
  with check (exists (select 1 from guest_households h where h.id = household_id and owns_project(h.project_id) and has_addon(h.project_id, 'rsvp')));
