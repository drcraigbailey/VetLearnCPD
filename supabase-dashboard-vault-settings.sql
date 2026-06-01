-- VetLearn dashboard, Vault and settings support
-- Run this once in Supabase SQL Editor.

-- Extend profile/contact information used by Dashboard and Settings.
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists practice_name text;
alter table public.profiles add column if not exists location text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists mobile text;
alter table public.profiles add column if not exists website text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists degrees text;
alter table public.profiles add column if not exists certifications text;
alter table public.profiles add column if not exists areas_of_interest text;
alter table public.profiles add column if not exists memberships text;
alter table public.profiles add column if not exists updated_at timestamptz default now();

create table if not exists public.dashboard_favourites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('page', 'drug', 'protocol', 'resource')),
  title text not null,
  url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dashboard_favourites_user_idx
on public.dashboard_favourites (user_id, created_at desc);

create table if not exists public.recently_viewed (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('drug', 'protocol', 'case', 'cpd', 'resource', 'page')),
  item_id text,
  title text not null,
  url text,
  metadata jsonb not null default '{}'::jsonb,
  viewed_at timestamptz not null default now()
);

create index if not exists recently_viewed_user_idx
on public.recently_viewed (user_id, viewed_at desc);

create table if not exists public.vault_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform_name text not null,
  website_url text,
  username text,
  password_value text,
  notes text,
  category text not null default 'Custom',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vault_entries_user_category_idx
on public.vault_entries (user_id, category, updated_at desc);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dashboard_config jsonb not null default '{}'::jsonb,
  ai_preferences jsonb not null default '{}'::jsonb,
  app_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dashboard_favourites enable row level security;
alter table public.recently_viewed enable row level security;
alter table public.vault_entries enable row level security;
alter table public.user_preferences enable row level security;

-- Dashboard favourites policies
drop policy if exists "Users can read own dashboard favourites" on public.dashboard_favourites;
create policy "Users can read own dashboard favourites" on public.dashboard_favourites for select to authenticated using (user_id = auth.uid());

drop policy if exists "Users can create own dashboard favourites" on public.dashboard_favourites;
create policy "Users can create own dashboard favourites" on public.dashboard_favourites for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "Users can update own dashboard favourites" on public.dashboard_favourites;
create policy "Users can update own dashboard favourites" on public.dashboard_favourites for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users can delete own dashboard favourites" on public.dashboard_favourites;
create policy "Users can delete own dashboard favourites" on public.dashboard_favourites for delete to authenticated using (user_id = auth.uid());

-- Recently viewed policies
drop policy if exists "Users can read own recently viewed" on public.recently_viewed;
create policy "Users can read own recently viewed" on public.recently_viewed for select to authenticated using (user_id = auth.uid());

drop policy if exists "Users can create own recently viewed" on public.recently_viewed;
create policy "Users can create own recently viewed" on public.recently_viewed for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "Users can update own recently viewed" on public.recently_viewed;
create policy "Users can update own recently viewed" on public.recently_viewed for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users can delete own recently viewed" on public.recently_viewed;
create policy "Users can delete own recently viewed" on public.recently_viewed for delete to authenticated using (user_id = auth.uid());

-- Vault policies
drop policy if exists "Users can read own vault entries" on public.vault_entries;
create policy "Users can read own vault entries" on public.vault_entries for select to authenticated using (user_id = auth.uid());

drop policy if exists "Users can create own vault entries" on public.vault_entries;
create policy "Users can create own vault entries" on public.vault_entries for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "Users can update own vault entries" on public.vault_entries;
create policy "Users can update own vault entries" on public.vault_entries for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users can delete own vault entries" on public.vault_entries;
create policy "Users can delete own vault entries" on public.vault_entries for delete to authenticated using (user_id = auth.uid());

-- User preferences policies
drop policy if exists "Users can read own preferences" on public.user_preferences;
create policy "Users can read own preferences" on public.user_preferences for select to authenticated using (user_id = auth.uid());

drop policy if exists "Users can create own preferences" on public.user_preferences;
create policy "Users can create own preferences" on public.user_preferences for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "Users can update own preferences" on public.user_preferences;
create policy "Users can update own preferences" on public.user_preferences for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Profile policies. Profiles are readable by signed-in users so Network,
-- Messages and sharing screens can show colleague names. Only owners can edit.
alter table public.profiles enable row level security;

drop policy if exists "Authenticated users can read profiles" on public.profiles;
create policy "Authenticated users can read profiles" on public.profiles for select to authenticated using (true);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "Users can create own profile" on public.profiles;
create policy "Users can create own profile" on public.profiles for insert to authenticated with check (id = auth.uid());

-- Profile image uploads
-- Creates a public bucket for small profile images. Users can only upload,
-- replace or delete files inside their own user-id folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-images',
  'profile-images',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

drop policy if exists "Profile images are publicly readable" on storage.objects;
create policy "Profile images are publicly readable"
on storage.objects
for select
to public
using (bucket_id = 'profile-images');

drop policy if exists "Users can upload own profile images" on storage.objects;
create policy "Users can upload own profile images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update own profile images" on storage.objects;
create policy "Users can update own profile images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own profile images" on storage.objects;
create policy "Users can delete own profile images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
