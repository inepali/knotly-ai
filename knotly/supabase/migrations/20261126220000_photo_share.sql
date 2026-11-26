-- Guest Photo Sharing add-on ($5): guests scan a QR code at the venue and upload photos without an
-- account. Private bucket: photos are shown through short-lived signed links, so photos waiting for
-- approval are never public. Uploads go through one-time signed upload URLs made by the server.

create table photo_share_settings (
  project_id uuid primary key references couple_projects on delete cascade,
  approve_first boolean not null default true,
  updated_at timestamptz not null default now()
);

create table guest_photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references couple_projects on delete cascade,
  path text not null unique,            -- {project_id}/{uuid}.webp in guest-photos
  width int not null check (width between 1 and 10000),
  height int not null check (height between 1 and 10000),
  bytes int not null check (bytes between 1 and 5242880),
  uploader_name text check (char_length(uploader_name) <= 60),
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  created_at timestamptz not null default now()
);
create index guest_photos_project on guest_photos (project_id, status, created_at desc);

create function guest_photo_cap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from guest_photos where project_id = new.project_id) >= 1000 then
    raise exception 'photo_limit: up to 1,000 photos';
  end if;
  return new;
end $$;
create trigger guest_photos_cap before insert on guest_photos for each row execute function guest_photo_cap();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guest-photos', 'guest-photos', false, 5242880, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

alter table photo_share_settings enable row level security;
alter table guest_photos enable row level security;

create policy "own photo settings read" on photo_share_settings for select using (owns_project(project_id));
create policy "own photo settings insert" on photo_share_settings for insert
  with check (owns_project(project_id) and has_addon(project_id, 'photo_share'));
create policy "own photo settings update" on photo_share_settings for update
  using (owns_project(project_id) and has_addon(project_id, 'photo_share')) with check (owns_project(project_id));

create policy "own photos read" on guest_photos for select using (owns_project(project_id));
create policy "own photos moderate" on guest_photos for update using (owns_project(project_id)) with check (owns_project(project_id));
create policy "own photos delete" on guest_photos for delete using (owns_project(project_id));
-- Guests never touch these rows directly: the server records each upload with the service role.

create function owns_project_folder(folder text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return owns_project(folder::uuid);
exception when others then
  return false;
end $$;
revoke all on function owns_project_folder(text) from public, anon;
grant execute on function owns_project_folder(text) to authenticated;

-- The couple can read (sign) their own wedding's files to view and download them.
drop policy if exists "guest photos owner read" on storage.objects;
drop policy if exists "guest photos owner delete" on storage.objects;
create policy "guest photos owner read" on storage.objects for select to authenticated
  using (bucket_id = 'guest-photos' and owns_project_folder((storage.foldername(name))[1]));
create policy "guest photos owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'guest-photos' and owns_project_folder((storage.foldername(name))[1]));

-- Photos past their keep date (a year after the wedding + 30 days to download), for the cleanup cron.
create function expired_guest_photos(p_limit int default 500) returns table (id uuid, path text)
language sql stable security definer set search_path = public as $$
  select g.id, g.path from guest_photos g join couple_projects p on p.id = g.project_id
  where coalesce(p.wedding_date::timestamptz, (select min(created_at) from guest_photos x where x.project_id = g.project_id))
        + interval '395 days' < now()
  limit p_limit
$$;
revoke all on function expired_guest_photos(int) from public, anon, authenticated;
grant execute on function expired_guest_photos(int) to service_role;
