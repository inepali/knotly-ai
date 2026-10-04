-- Budget planning: one line per category of the couple's wedding.
-- planned = target (suggested by the assistant or set by the couple)
-- booked  = what they've committed to pay
-- Vendor quotes aren't copied here; the Budget tab reads them live from `quotes`.
create table budget_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references couple_projects on delete cascade,
  category text not null,               -- photographer, venue, … or 'other'
  label text,                           -- e.g. "Rings", when category is 'other'
  planned int check (planned >= 0),     -- whole USD
  planned_by text check (planned_by in ('ai', 'couple')),
  booked int check (booked >= 0),
  booked_vendor_id uuid references vendors on delete set null,
  booked_note text,                     -- e.g. "Golden Hour Co., Signature package"
  updated_at timestamptz not null default now(),
  unique nulls not distinct (project_id, category, label)  -- one "photographer" line, even with no label
);
create index on budget_items (project_id);

alter table budget_items enable row level security;

-- Only the couple who owns the wedding sees and edits its budget.
create policy "couple manages own budget" on budget_items for all
  using (exists (select 1 from couple_projects p where p.id = budget_items.project_id and p.couple_id = auth.uid()))
  with check (exists (select 1 from couple_projects p where p.id = budget_items.project_id and p.couple_id = auth.uid()));
