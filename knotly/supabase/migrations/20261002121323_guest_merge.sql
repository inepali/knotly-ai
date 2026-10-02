-- Remembers which guest asked for a code, and which path we took. Server-only (no policies).
create table pending_verifications (
  email text primary key,
  guest_id uuid not null,
  mode text not null check (mode in ('upgrade','existing')),
  created_at timestamptz default now()
);
alter table pending_verifications enable row level security;

-- Move a guest's wedding into a real account. Saved values win; differences are returned.
create or replace function merge_guest_into_user(p_guest uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g couple_projects; u couple_projects;
  f text; conflicts jsonb := '[]'::jsonb;
begin
  select * into g from couple_projects where couple_id = p_guest limit 1;
  if g.id is null then return conflicts; end if;

  select * into u from couple_projects where couple_id = p_user limit 1;
  if u.id is null then                       -- no saved wedding: just take the guest's
    update couple_projects set couple_id = p_user where id = g.id;
    return conflicts;
  end if;

  foreach f in array array['wedding_date','metro_slug','guest_count','budget_total','style'] loop
    if to_jsonb(g)->>f is not null and to_jsonb(u)->>f is not null
       and to_jsonb(g)->>f <> to_jsonb(u)->>f then
      conflicts := conflicts || jsonb_build_object('field', f, 'saved', to_jsonb(u)->>f, 'today', to_jsonb(g)->>f);
    end if;
  end loop;

  update couple_projects set                 -- fill blanks in the saved wedding
    partner_names = coalesce(u.partner_names, g.partner_names),
    wedding_date  = coalesce(u.wedding_date,  g.wedding_date),
    metro_slug    = coalesce(u.metro_slug,    g.metro_slug),
    guest_count   = coalesce(u.guest_count,   g.guest_count),
    budget_total  = coalesce(u.budget_total,  g.budget_total),
    style         = coalesce(u.style,         g.style),
    needs         = (select array(select distinct unnest(u.needs || g.needs)))
  where id = u.id;
  delete from couple_projects where id = g.id;
  return conflicts;
end $$;

revoke execute on function merge_guest_into_user from public, anon, authenticated;