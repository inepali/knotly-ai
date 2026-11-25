-- Hours of service the couple wants per needed category (e.g. photographer 6, DJ 6), so vendors
-- can quote the right amount. Optional; null = not specified.
alter table project_needs
  add column if not exists service_hours int check (service_hours between 1 and 24);
