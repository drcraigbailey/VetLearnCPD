-- Network posts feed for VetLearn
-- Run this in Supabase SQL Editor, then refresh the app.

create table if not exists public.network_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text,
  shared_type text,
  shared_title text,
  shared_url text,
  shared_payload jsonb,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint network_posts_has_content check (
    nullif(trim(coalesce(body, '')), '') is not null
    or nullif(trim(coalesce(shared_title, '')), '') is not null
  ),
  constraint network_posts_shared_type_check check (
    shared_type is null
    or shared_type in ('caselog', 'drug', 'protocol', 'cpd', 'resource')
  )
);

alter table public.network_posts
  add column if not exists shared_payload jsonb;

create index if not exists network_posts_created_at_idx
  on public.network_posts(created_at desc)
  where is_deleted = false;

create index if not exists network_posts_author_id_idx
  on public.network_posts(author_id);

alter table public.network_posts enable row level security;

drop policy if exists "Network posts are readable by signed in users" on public.network_posts;
create policy "Network posts are readable by signed in users"
  on public.network_posts
  for select
  to authenticated
  using (is_deleted = false);

drop policy if exists "Users can create their own network posts" on public.network_posts;
create policy "Users can create their own network posts"
  on public.network_posts
  for insert
  to authenticated
  with check (auth.uid() = author_id);

drop policy if exists "Users can update their own network posts" on public.network_posts;
create policy "Users can update their own network posts"
  on public.network_posts
  for update
  to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

drop policy if exists "Users can delete their own network posts" on public.network_posts;
create policy "Users can delete their own network posts"
  on public.network_posts
  for delete
  to authenticated
  using (auth.uid() = author_id);

create or replace function public.set_network_posts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_network_posts_updated_at on public.network_posts;
create trigger set_network_posts_updated_at
before update on public.network_posts
for each row
execute function public.set_network_posts_updated_at();
