-- Form-first migration, step 3: couples post their wedding and matching vendors respond.
--   * couple_projects.posted_at         when the couple tapped "Post to vendors"
--   * project_needs                     one row per needed category: optional budget + estimate cap
--   * threads.origin / queue_rank       threads created by a post (vs. an inquiry the couple sent),
--                                       and the order matched vendors are asked in
--   * couple_sees_thread()              couples only see post threads once a vendor sent an estimate
--   * match_project_vendors()           SQL matching: category, service radius, free date, budget
-- Apply with `pnpm migrate`.

-- 1. Posting ---------------------------------------------------------------------------
alter table couple_projects add column posted_at timestamptz;

create table project_needs (
  project_id    uuid not null references couple_projects on delete cascade,
  category      text not null references vendor_categories (slug),
  budget        int check (budget >= 0),              -- whole USD, optional
  estimate_cap  int not null default 5 check (estimate_cap between 1 and 50),
  primary key (project_id, category)
);
alter table project_needs enable row level security;

create policy "couple manages own needs" on project_needs for all
  using (exists (select 1 from couple_projects p where p.id = project_needs.project_id and p.couple_id = auth.uid()))
  with check (exists (select 1 from couple_projects p where p.id = project_needs.project_id and p.couple_id = auth.uid()));

-- couple_projects.needs stays (chat and guest merge still read it); the app keeps both in step.
insert into project_needs (project_id, category)
select p.id, n
from couple_projects p, unnest(p.needs) n
where n in (select slug from vendor_categories)
on conflict do nothing;

-- 2. Threads created by a post ----------------------------------------------------------
alter table threads
  add column origin     text not null default 'inquiry' check (origin in ('inquiry', 'post')),
  add column queue_rank int;   -- lower = asked earlier; weighted-random order stored so a wave can be replayed
create index threads_post_queue on threads (project_id, queue_rank) where origin = 'post';

create function thread_has_quote(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from quotes q where q.thread_id = t);
$$;

-- Couples see inquiry threads as before, but post threads only once a vendor sent an estimate:
-- queued, declined and still-thinking vendors stay invisible to them. Vendors are unaffected.
create function couple_sees_thread(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from threads th join couple_projects p on p.id = th.project_id
    where th.id = t and p.couple_id = auth.uid()
      and (th.origin = 'inquiry' or thread_has_quote(th.id))
  );
$$;

drop policy "couple or vendor sees thread" on threads;
create policy "couple or vendor sees thread" on threads for select
  using (
    vendor_id = auth.uid()
    or (
      exists (select 1 from couple_projects p where p.id = project_id and p.couple_id = auth.uid())
      and (origin = 'inquiry' or thread_has_quote(id))
    )
  );

drop policy "read messages" on messages;
create policy "read messages" on messages for select using (
  (
    couple_sees_thread(messages.thread_id)
    and (messages.status = 'sent' or messages.sender in ('couple', 'couple_agent'))
  )
  or exists (
    select 1 from threads t
    where t.id = messages.thread_id
      and t.vendor_id = auth.uid()
      and (messages.status = 'sent' or messages.sender in ('vendor', 'vendor_agent'))
  )
);

-- 3. Matching ---------------------------------------------------------------------------
-- Published vendors in `p_category` that could take this wedding:
--   - the wedding's city is inside the vendor's service radius,
--   - the date isn't booked/blocked (an unexpired hold counts as taken, an expired one is free),
--   - the cheapest package fits the category budget, else the total budget (no budget = fits),
--   - the vendor has no thread with this project yet (so re-matching never duplicates).
-- Needs a date and a city; returns nothing otherwise. Called by the server with the service role.
create function match_project_vendors(p_project uuid, p_category text)
returns table (vendor_id uuid, cheapest_price int)
language sql stable set search_path = public as $$
  with p as (
    select cp.id, cp.wedding_date, m.lat, m.lng,
           coalesce(pn.budget, cp.budget_total) as budget
    from couple_projects cp
    join metros m on m.slug = cp.metro_slug
    left join project_needs pn on pn.project_id = cp.id and pn.category = p_category
    where cp.id = p_project and cp.wedding_date is not null
  )
  select v.id, min(vp.price)::int
  from p
  join vendors v on v.published and v.category = p_category and v.location is not null
  join vendor_packages vp on vp.vendor_id = v.id
  where st_dwithin(
          v.location,
          st_setsrid(st_makepoint(p.lng, p.lat), 4326)::geography,
          coalesce(v.service_radius_miles, 50) * 1609.344
        )
    and not exists (
      select 1 from vendor_availability a
      where a.vendor_id = v.id and a.date = p.wedding_date
        and (a.status in ('booked', 'blocked')
             or (a.status = 'held' and (a.hold_expires_at is null or a.hold_expires_at > now())))
    )
    and not exists (select 1 from threads t where t.project_id = p.id and t.vendor_id = v.id)
  group by v.id, p.budget
  having p.budget is null or min(vp.price) <= p.budget;
$$;

revoke execute on function match_project_vendors(uuid, text) from public, anon, authenticated;
grant execute on function match_project_vendors(uuid, text) to service_role;
