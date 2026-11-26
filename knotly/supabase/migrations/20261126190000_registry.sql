-- Gift Registry add-on ($5), shown on the wedding website.
-- Knotly never handles money: store registries and cash funds are links to other services.
-- Guests' claims and "I sent a gift" notes are written by the server (service role) only.

create table registry_settings (
  project_id uuid primary key references couple_projects on delete cascade,
  intro text check (char_length(intro) <= 600),
  updated_at timestamptz not null default now()
);

create table registry_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references couple_projects on delete cascade,
  store text not null check (char_length(store) between 1 and 60),
  url text not null check (url ~ '^https://' and char_length(url) <= 500),
  note text check (char_length(note) <= 200),
  sort int not null default 0
);

-- Cash / honeymoon funds: payment methods are [{ kind: venmo|paypal|cashapp|zelle|honeyfund|link, value }].
create table registry_funds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references couple_projects on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  description text check (char_length(description) <= 600),
  goal_cents int check (goal_cents between 100 and 100000000),
  methods jsonb not null default '[]' check (jsonb_typeof(methods) = 'array' and jsonb_array_length(methods) <= 6),
  sort int not null default 0
);

create table registry_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references couple_projects on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  url text check (url ~ '^https://' and char_length(url) <= 500),
  image_url text check (image_url ~ '^https://' and char_length(image_url) <= 500),
  price_cents int check (price_cents between 0 and 10000000),
  quantity int not null default 1 check (quantity between 1 and 20),
  note text check (char_length(note) <= 200),
  sort int not null default 0
);

create table registry_claims (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references registry_items on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);
create index registry_claims_item on registry_claims (item_id);

-- "I sent a gift" from a guest (fund or anything else). Feeds the Thank-You Tracker later.
create table registry_gift_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references couple_projects on delete cascade,
  fund_id uuid references registry_funds on delete set null,
  name text not null check (char_length(name) between 1 and 60),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index registry_gift_notes_project on registry_gift_notes (project_id, created_at desc);

-- Limits per wedding.
create function registry_cap() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; lim int := case tg_table_name when 'registry_items' then 50 else 10 end;
begin
  execute format('select count(*) from %I where project_id = $1', tg_table_name) into n using new.project_id;
  if n >= lim then raise exception 'registry_limit: up to % here', lim; end if;
  return new;
end $$;
create trigger registry_links_cap before insert on registry_links for each row execute function registry_cap();
create trigger registry_funds_cap before insert on registry_funds for each row execute function registry_cap();
create trigger registry_items_cap before insert on registry_items for each row execute function registry_cap();

alter table registry_settings enable row level security;
alter table registry_links enable row level security;
alter table registry_funds enable row level security;
alter table registry_items enable row level security;
alter table registry_claims enable row level security;
alter table registry_gift_notes enable row level security;

-- Owners read everything; edits need the active add-on.
do $$
declare t text;
begin
  foreach t in array array['registry_settings', 'registry_links', 'registry_funds', 'registry_items'] loop
    execute format('create policy "own read" on %I for select using (owns_project(project_id))', t);
    execute format('create policy "own insert" on %I for insert with check (owns_project(project_id) and has_addon(project_id, %L))', t, 'registry');
    execute format('create policy "own update" on %I for update using (owns_project(project_id) and has_addon(project_id, %L)) with check (owns_project(project_id))', t, 'registry');
    execute format('create policy "own delete" on %I for delete using (owns_project(project_id))', t);
  end loop;
end $$;

create policy "own claims read" on registry_claims for select
  using (exists (select 1 from registry_items i where i.id = item_id and owns_project(i.project_id)));
create policy "own claims delete" on registry_claims for delete
  using (exists (select 1 from registry_items i where i.id = item_id and owns_project(i.project_id)));
create policy "own gift notes read" on registry_gift_notes for select using (owns_project(project_id));
create policy "own gift notes delete" on registry_gift_notes for delete using (owns_project(project_id));

-- Claim one of an item, without going over its quantity (locks the item row). Service role only.
create function claim_registry_item(p_project uuid, p_item uuid, p_name text, p_note text) returns text
language plpgsql security definer set search_path = public as $$
declare q int; n int;
begin
  select quantity into q from registry_items where id = p_item and project_id = p_project for update;
  if q is null then return 'missing'; end if;
  select count(*) into n from registry_claims where item_id = p_item;
  if n >= q then return 'taken'; end if;
  insert into registry_claims (item_id, name, note) values (p_item, p_name, nullif(p_note, ''));
  return 'ok';
end $$;
revoke all on function claim_registry_item(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function claim_registry_item(uuid, uuid, text, text) to service_role;
