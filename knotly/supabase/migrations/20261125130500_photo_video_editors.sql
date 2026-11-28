-- New vendor categories under "Photo & video". Keep in sync with src/lib/categories.ts.
insert into vendor_categories (slug, name, category_group, sort_order) values
  ('photo_editor', 'Photo Editor', 'Photo & video', 34),
  ('video_editor', 'Video Editor', 'Photo & video', 35)
on conflict (slug) do nothing;
