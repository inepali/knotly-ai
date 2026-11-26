-- Free-text from the couple on My Wedding: their story, and what they expect from vendors.
-- Both optional; shown to vendors in the estimate request.
alter table couple_projects
  add column if not exists love_story text check (char_length(love_story) <= 2000),
  add column if not exists project_details text check (char_length(project_details) <= 2000);
