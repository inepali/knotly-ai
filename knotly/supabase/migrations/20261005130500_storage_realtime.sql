-- MVP Phase 0: storage buckets with policies, and Realtime for live pages.
-- Paths: documents/<project_id>/..., website-covers/<project_id>/..., vendor-photos/<vendor_id>/...
-- contracts/<booking_id>/... is server-only (signed URLs).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('documents', 'documents', false, 20971520,
   array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('contracts', 'contracts', false, 20971520, array['application/pdf']),
  ('vendor-photos', 'vendor-photos', true, 10485760,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('website-covers', 'website-covers', true, 10485760,
   array['image/jpeg', 'image/png', 'image/webp']);

-- First folder of an object path as a uuid, or null when it isn't one.
create function storage_owner_folder(p_name text) returns uuid
language plpgsql immutable set search_path = public as $$
begin
  return (storage.foldername(p_name))[1]::uuid;
exception when others then
  return null;
end $$;

-- documents: the couple uploads, reads and deletes their own files. Vendors get signed URLs
-- from the server after a document_shares check (no vendor policy here).
create policy "couple reads own documents" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and owns_project(storage_owner_folder(name)));
create policy "couple uploads own documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and owns_project(storage_owner_folder(name)));
create policy "couple deletes own documents" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and owns_project(storage_owner_folder(name)));

-- vendor-photos: public read by URL (public bucket); the vendor lists and manages their own folder.
create policy "vendor lists own photos" on storage.objects for select to authenticated
  using (bucket_id = 'vendor-photos' and storage_owner_folder(name) = auth.uid());
create policy "vendor uploads own photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'vendor-photos' and storage_owner_folder(name) = auth.uid());
create policy "vendor updates own photos" on storage.objects for update to authenticated
  using (bucket_id = 'vendor-photos' and storage_owner_folder(name) = auth.uid());
create policy "vendor deletes own photos" on storage.objects for delete to authenticated
  using (bucket_id = 'vendor-photos' and storage_owner_folder(name) = auth.uid());

-- website-covers: public read by URL (public bucket); the couple lists and manages their own folder.
create policy "couple lists own cover" on storage.objects for select to authenticated
  using (bucket_id = 'website-covers' and owns_project(storage_owner_folder(name)));
create policy "couple uploads own cover" on storage.objects for insert to authenticated
  with check (bucket_id = 'website-covers' and owns_project(storage_owner_folder(name)));
create policy "couple updates own cover" on storage.objects for update to authenticated
  using (bucket_id = 'website-covers' and owns_project(storage_owner_folder(name)));
create policy "couple deletes own cover" on storage.objects for delete to authenticated
  using (bucket_id = 'website-covers' and owns_project(storage_owner_folder(name)));

-- Realtime: postgres_changes respects RLS, so each party only hears about their own rows.
alter publication supabase_realtime add table bookings, messages, activity_events;
