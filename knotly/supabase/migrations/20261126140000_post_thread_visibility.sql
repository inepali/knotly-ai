-- Couples saw a posted project's thread only once the vendor sent an estimate. But a vendor (or their
-- agent) may first ask a question ("how many hours?"), and that reply stayed hidden, so the couple
-- could never answer. Now a post thread shows up once the vendor has sent an estimate OR any message.
-- Queued vendors and vendors who declined still stay invisible: a decline on a post writes no message.
-- Safe to run more than once.

create or replace function vendor_replied(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from quotes q where q.thread_id = t)
      or exists (select 1 from messages m
                 where m.thread_id = t and m.status = 'sent' and m.sender in ('vendor', 'vendor_agent'));
$$;

create or replace function couple_sees_thread(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from threads th join couple_projects p on p.id = th.project_id
    where th.id = t and p.couple_id = auth.uid()
      and (th.origin = 'inquiry' or vendor_replied(th.id))
  );
$$;

drop policy if exists "couple or vendor sees thread" on threads;
create policy "couple or vendor sees thread" on threads for select
  using (
    vendor_id = auth.uid()
    or (
      exists (select 1 from couple_projects p where p.id = project_id and p.couple_id = auth.uid())
      and (origin = 'inquiry' or vendor_replied(id))
    )
  );
