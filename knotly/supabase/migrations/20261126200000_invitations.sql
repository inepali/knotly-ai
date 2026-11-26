-- Save-the-Dates & Invitations add-on ($5): a design per kind, emailed to each household with
-- its personal link, plus print-ready cards. Sends are logged (max 2 per household per kind).

create table invitation_designs (
  project_id uuid not null references couple_projects on delete cascade,
  kind text not null check (kind in ('save_the_date', 'invitation')),
  template text not null default 'classic' check (template in ('classic', 'modern', 'garden', 'minimal')),
  heading text not null default '' check (char_length(heading) <= 80),
  message text not null default '' check (char_length(message) <= 800),
  details text not null default '' check (char_length(details) <= 300),
  show_photo boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (project_id, kind)
);

create table invitation_sends (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references couple_projects on delete cascade,
  household_id uuid not null references guest_households on delete cascade,
  kind text not null check (kind in ('save_the_date', 'invitation')),
  email text not null check (char_length(email) <= 254),
  provider_id text,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error text check (char_length(error) <= 300),
  sent_at timestamptz not null default now()
);
create index invitation_sends_household on invitation_sends (household_id, kind);

alter table invitation_designs enable row level security;
alter table invitation_sends enable row level security;

create policy "own designs read" on invitation_designs for select using (owns_project(project_id));
create policy "own designs insert" on invitation_designs for insert
  with check (owns_project(project_id) and has_addon(project_id, 'invitations'));
create policy "own designs update" on invitation_designs for update
  using (owns_project(project_id) and has_addon(project_id, 'invitations')) with check (owns_project(project_id));
create policy "own sends read" on invitation_sends for select using (owns_project(project_id));
create policy "own sends insert" on invitation_sends for insert
  with check (owns_project(project_id) and has_addon(project_id, 'invitations')
              and exists (select 1 from guest_households h where h.id = household_id and h.project_id = invitation_sends.project_id));
