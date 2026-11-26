-- A private calendar feed per vendor. Calendar apps (Google, Apple, Outlook) can't sign in, so the
-- feed URL carries a secret token. Anyone with the link can read the booked dates, so it can be reset.
create table vendor_calendar_feeds (
  vendor_id  uuid primary key references vendors on delete cascade,
  token      text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);
alter table vendor_calendar_feeds enable row level security;
create policy "own feed" on vendor_calendar_feeds for all
  using (vendor_id = auth.uid()) with check (vendor_id = auth.uid());
