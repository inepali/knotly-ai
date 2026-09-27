-- One row per user. Role decides which AI tools they get.
create table profiles (
  id                uuid primary key references auth.users on delete cascade,
  role              text not null default 'couple'
                    check (role in ('couple', 'vendor', 'admin')),
  full_name         text,
  email             text,
  phone             text,
  is_guest          boolean not null default false,
  onboarded         boolean not null default false,
  terms_version     text,
  terms_accepted_at timestamptz,
  created_at        timestamptz default now()
);

-- Trigger: when Supabase Auth creates a user, create their profile automatically.
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  wanted text := new.raw_user_meta_data->>'role';
begin
  insert into profiles (id, role, email, is_guest)
  values (
    new.id,
    case when wanted in ('couple', 'vendor') then wanted else 'couple' end, -- never 'admin' from signup
    new.email,
    coalesce(new.is_anonymous, false)
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Security
alter table profiles enable row level security;

create policy "read own profile" on profiles
  for select
  using (id = auth.uid());

create policy "update own profile" on profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Users may only change these columns (not role or is_guest)
revoke update on profiles from authenticated, anon;

grant update (full_name, phone, onboarded, terms_version, terms_accepted_at)
on profiles to authenticated;
