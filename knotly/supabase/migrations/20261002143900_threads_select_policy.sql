-- The old select policy called owns_thread(id), which looks the thread up by id.
-- During INSERT ... RETURNING the new row isn't visible to that lookup yet, so
-- starting a thread failed with "new row violates row-level security policy".
-- Check the row's own project instead.
drop policy "couple or vendor sees thread" on threads;

create policy "couple or vendor sees thread" on threads for select
  using (
    vendor_id = auth.uid()
    or exists (select 1 from couple_projects p where p.id = project_id and p.couple_id = auth.uid())
  );
