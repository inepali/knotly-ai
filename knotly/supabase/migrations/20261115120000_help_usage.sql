-- Help chat usage: one counter per person (or hashed network address) per day, so a daily cap
-- can be enforced. No message text is stored here.
create table help_usage (
  subject text not null,          -- 'u:<user id>' or 'ip:<hash>'
  day     date not null default current_date,
  count   int  not null default 0,
  primary key (subject, day)
);
alter table help_usage enable row level security;   -- no policies: only the service role touches it

-- Count one message if the person is under today's cap. Returns true when it was counted,
-- false when the cap is reached. Atomic, so two quick requests can't both slip past the limit.
create function take_help_quota(p_subject text, p_limit int) returns boolean
language sql security definer set search_path = public as $$
  with bumped as (
    insert into help_usage (subject, day, count) values (p_subject, current_date, 1)
    on conflict (subject, day) do update set count = help_usage.count + 1
      where help_usage.count < p_limit
    returning 1
  )
  select exists (select 1 from bumped);
$$;
revoke execute on function take_help_quota(text, int) from public, anon, authenticated;
grant execute on function take_help_quota(text, int) to service_role;

-- Old counters aren't needed; a cron or manual `delete from help_usage where day < current_date - 7` keeps it small.
