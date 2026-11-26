-- Named events on the vendor calendar: a title (e.g. the couple's names) and free-text details.
-- Both optional; only used for dates the vendor marks by hand.
alter table vendor_availability
  add column if not exists title text check (char_length(title) <= 80),
  add column if not exists details text check (char_length(details) <= 2000);
