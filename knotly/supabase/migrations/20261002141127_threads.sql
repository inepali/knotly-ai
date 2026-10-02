-- One conversation per couple + vendor
create table threads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references couple_projects on delete cascade,
  vendor_id uuid not null references vendors,
  status text not null default 'open',
  created_at timestamptz default now(),
  unique (project_id, vendor_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references threads on delete cascade,
  sender text not null check (sender in ('couple','couple_agent','vendor','vendor_agent','system')),
  subject text,
  body text not null,
  payload jsonb,                               -- structured facts for the vendor's agent later
  status text not null default 'sent' check (status in ('pending_approval','sent')),
  created_at timestamptz default now()
);

alter table threads enable row level security;
alter table messages enable row level security;

-- Helper: is this thread mine as the couple?
create function owns_thread(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from threads th join couple_projects p on p.id = th.project_id
                 where th.id = t and p.couple_id = auth.uid());
$$;

create policy "couple or vendor sees thread" on threads for select
  using (owns_thread(id) or vendor_id = auth.uid());
create policy "couple starts thread" on threads for insert
  with check (exists (select 1 from couple_projects p where p.id = project_id and p.couple_id = auth.uid()));

-- Couples see their drafts and sent messages; vendors only ever see sent ones
create policy "read messages" on messages for select using (
  owns_thread(thread_id)
  or (status = 'sent' and exists (select 1 from threads t where t.id = thread_id and t.vendor_id = auth.uid()))
);
-- Couples (and their agent) can only create or edit DRAFTS
create policy "couple drafts" on messages for insert
  with check (owns_thread(thread_id) and status = 'pending_approval' and sender in ('couple','couple_agent'));
create policy "couple edits drafts" on messages for update
  using (owns_thread(thread_id) and status = 'pending_approval')
  with check (status = 'pending_approval');