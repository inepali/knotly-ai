-- Vendor categories, stored in the database instead of only in code. Same list and order
-- as src/lib/categories.ts (keep the two in sync).
create table vendor_categories (
  slug text primary key,
  name text not null,
  category_group text not null,
  sort_order int not null,
  active boolean not null default true
);
alter table vendor_categories enable row level security;
create policy "categories public" on vendor_categories for select using (true);

insert into vendor_categories (slug, name, category_group, sort_order) values
  ('wedding_planner', 'Wedding Planner', 'Planning', 1),
  ('day_of_coordinator', 'Day-of Coordinator', 'Planning', 2),
  ('stylist', 'Stylist', 'Planning', 3),
  ('venue', 'Venue', 'Venue & food', 4),
  ('caterer', 'Caterer', 'Venue & food', 5),
  ('bartending', 'Bartending', 'Venue & food', 6),
  ('baker', 'Baker', 'Venue & food', 7),
  ('dessert', 'Dessert', 'Venue & food', 8),
  ('photographer', 'Photographer', 'Photo & video', 9),
  ('videographer', 'Videographer', 'Photo & video', 10),
  ('content_creator', 'Content Creator', 'Photo & video', 11),
  ('photo_booth', 'Photo Booth', 'Photo & video', 12),
  ('dj', 'DJ', 'Music & entertainment', 13),
  ('mc', 'Master of Ceremonies', 'Music & entertainment', 14),
  ('live_band', 'Live Band', 'Music & entertainment', 15),
  ('ceremony_musicians', 'Ceremony / Cocktail Musicians', 'Music & entertainment', 16),
  ('live_entertainer', 'Live Entertainer', 'Music & entertainment', 17),
  ('florist', 'Florist', 'Decor & rentals', 18),
  ('event_rental', 'Event Rental', 'Decor & rentals', 19),
  ('tent_rental', 'Tent Rental', 'Decor & rentals', 20),
  ('bridal_boutique', 'Bridal Boutique', 'Attire & beauty', 21),
  ('tuxedo_rental', 'Tuxedo Rental', 'Attire & beauty', 22),
  ('seamstress', 'Seamstress', 'Attire & beauty', 23),
  ('hair_stylist', 'Hair Stylist', 'Attire & beauty', 24),
  ('makeup_artist', 'Makeup Artist', 'Attire & beauty', 25),
  ('calligrapher', 'Calligrapher', 'Stationery & keepsakes', 26),
  ('transportation', 'Transportation', 'Guest services', 27),
  ('wedding_officiant', 'Wedding Officiant', 'Ceremony', 28),
  ('jeweler', 'Jeweler', 'Attire & beauty', 29),
  ('valet_parking', 'Valet Parking', 'Guest services', 30),
  ('security', 'Security Service', 'Guest services', 31),
  ('audio_guestbook', 'Audio Guestbook', 'Stationery & keepsakes', 32),
  ('live_painter', 'Live Painter', 'Music & entertainment', 33);

-- Move old category values to the new ones.
--   planner→wedding_planner, band→live_band, cake→baker, officiant→wedding_officiant,
--   rentals→event_rental, hair_makeup→hair_stylist (+ makeup_artist where it's a need)
create temporary table category_moves (old text primary key, new text not null) on commit drop;
insert into category_moves values
  ('planner', 'wedding_planner'), ('band', 'live_band'), ('cake', 'baker'),
  ('officiant', 'wedding_officiant'), ('rentals', 'event_rental'), ('hair_makeup', 'hair_stylist');

update vendors v set category = m.new from category_moves m where v.category = m.old;
update budget_items b set category = m.new from category_moves m where b.category = m.old;

-- needs is an array: rename each element; hair_makeup becomes both hair_stylist and makeup_artist.
update couple_projects p set needs = (
  select coalesce(array_agg(distinct n order by n), '{}')
  from (
    select coalesce(m.new, x) as n from unnest(p.needs) x left join category_moves m on m.old = x
    union all
    select 'makeup_artist' where 'hair_makeup' = any(p.needs)
  ) t
)
where p.needs && (select array_agg(old) from category_moves);

-- From now on a vendor's category must be one of the list.
alter table vendors add constraint vendors_category_fkey
  foreign key (category) references vendor_categories (slug) on update cascade;
