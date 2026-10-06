-- Fix: inserting a timeline assignment failed with "infinite recursion detected in policy".
-- The insert check read timeline_events, whose vendor policy reads timeline_assignments.
-- Do the whole check in a security-definer helper instead (found by supabase/tests/030).
create function can_assign_timeline_vendor(p_event uuid, p_vendor uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from timeline_events t
      join couple_projects p on p.id = t.project_id and p.couple_id = auth.uid()
      join bookings b on b.project_id = t.project_id and b.vendor_id = p_vendor
     where t.id = p_event
       and b.status in ('held', 'contract_sent', 'signed', 'booked', 'completed'));
$$;

drop policy "couple manages own assignments" on timeline_assignments;
create policy "couple manages own assignments" on timeline_assignments for all to authenticated
  using (owns_timeline_event(event_id))
  with check (can_assign_timeline_vendor(event_id, vendor_id));
