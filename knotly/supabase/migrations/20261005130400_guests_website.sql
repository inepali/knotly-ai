-- MVP Phase 0 (spec §9): Help assistant usage cap (CH-1) and the shared wedding-day timeline.
--
-- Originally this file also created `guests`, `wedding_websites`, `registry_links` and the
-- public_website / find_rsvp / submit_rsvp / set_website_password functions. Those are replaced by
-- the couple add-ons (20261126160000 guest_list, 170000 wedding_website, 180000 rsvp,
-- 190000 registry), which use households, per-event RSVP and add-on gating. Databases that
-- already ran the old version of this file are cleaned up by 20261126155000_reconcile_phase0.

create table help_usage (
  profile_id uuid references profiles on delete cascade,
  day date not null default current_date,
  messages int not null default 0,
  primary key (profile_id, day)
);

alter table help_usage enable row level security;

-- Read only: the count goes up through take_help_message(), so the cap can't be reset.
create policy "read own help usage" on help_usage for select to authenticated
  using (profile_id = auth.uid());

-- Help assistant: 30 messages per couple per day (CLAUDE.md cost rules). Counts one message
-- and returns true, or returns false once the day's cap is reached.
create function take_help_message() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  if auth.uid() is null then
    return false;
  end if;
  insert into help_usage (profile_id, day, messages) values (auth.uid(), current_date, 1)
  on conflict (profile_id, day) do update set messages = help_usage.messages + 1
    where help_usage.messages < 30
  returning messages into v_count;
  return v_count is not null;
end $$;
revoke execute on function take_help_message from public, anon;
grant execute on function take_help_message to authenticated;

-- Read-only wedding-day timeline for the wedding party (CO-3 share link).
create function shared_timeline(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'partner_names', p.partner_names,
    'wedding_date', p.wedding_date,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('starts_at', t.starts_at, 'duration_min', t.duration_min,
                                          'title', t.title, 'location', t.location, 'notes', t.notes)
                       order by t.starts_at, t.sort)
        from timeline_events t
       where t.project_id = p.id and t.visibility in ('everyone', 'party')), '[]'))
  from couple_projects p
  where p.timeline_share_token = p_token;
$$;
grant execute on function shared_timeline to anon, authenticated;
