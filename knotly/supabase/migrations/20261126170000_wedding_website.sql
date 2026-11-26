-- Wedding Website add-on ($5): one public page per wedding at /w/{slug}.
-- The couple edits it (only with an active "website" add-on); the public page is rendered on the
-- server with the service role and never includes guest-list data.

create table wedding_sites (
  project_id uuid primary key references couple_projects on delete cascade,
  slug text not null unique
    check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$' and slug !~ '--'),
  theme text not null default 'classic' check (theme in ('classic', 'garden', 'modern', 'blush', 'midnight')),
  title text check (char_length(title) <= 80),             -- defaults to the partner names
  sections jsonb not null default '[]',                    -- [{ type, enabled, ...content }] in page order
  photos jsonb not null default '[]',                      -- [{ path, width, height, caption }], first = cover
  password_hash text,                                      -- scrypt; null = open to anyone with the link
  indexable boolean not null default false,                -- search engines only when the couple opts in
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(sections) = 'array' and jsonb_array_length(sections) <= 20),
  check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 10),
  check (pg_column_size(sections) <= 64000)
);

alter table wedding_sites enable row level security;

-- Owners can always read (and export); writing needs the add-on to be active.
create policy "own site read" on wedding_sites for select using (owns_project(project_id));
create policy "own site insert" on wedding_sites for insert
  with check (owns_project(project_id) and has_addon(project_id, 'website'));
create policy "own site update" on wedding_sites for update
  using (owns_project(project_id) and has_addon(project_id, 'website'))
  with check (owns_project(project_id) and has_addon(project_id, 'website'));
create policy "own site delete" on wedding_sites for delete using (owns_project(project_id));

-- Photos: public bucket (served from the CDN). Paths are {project_id}/{uuid}.webp; only the couple,
-- with the add-on, can write in their wedding's folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wedding-sites', 'wedding-sites', true, 3145728, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

create function can_write_site_folder(folder text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare p uuid;
begin
  begin
    p := folder::uuid;
  exception when others then
    return false;
  end;
  return owns_project(p) and has_addon(p, 'website');
end $$;
revoke all on function can_write_site_folder(text) from public, anon;
grant execute on function can_write_site_folder(text) to authenticated;

drop policy if exists "site photos insert" on storage.objects;
drop policy if exists "site photos delete" on storage.objects;
create policy "site photos insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'wedding-sites' and can_write_site_folder((storage.foldername(name))[1]));
create policy "site photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'wedding-sites' and can_write_site_folder((storage.foldername(name))[1]));

-- Is this address free? (RLS hides other couples' sites, so the check runs as definer.)
create function site_slug_available(p_slug text, p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from wedding_sites where slug = lower(p_slug) and project_id <> p_project)
$$;
revoke all on function site_slug_available(text, uuid) from public, anon;
grant execute on function site_slug_available(text, uuid) to authenticated;
