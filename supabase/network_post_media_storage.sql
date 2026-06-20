-- VetLearn Network post media storage
-- Run in Supabase SQL Editor if post image attachments do not upload/display.
-- Safe to re-run.

insert into storage.buckets (id, name, public)
values ('network-post-media', 'network-post-media', false)
on conflict (id) do nothing;

alter table if exists public.network_posts
  add column if not exists attachment_urls text[] not null default '{}'::text[],
  add column if not exists visibility text not null default 'network',
  add column if not exists post_category text not null default 'General';

create or replace function public.network_post_attachment_count(value text[])
returns integer
language sql
immutable
as $$
  select coalesce(array_length(value, 1), 0);
$$;

create or replace function public.network_post_attachment_count(value jsonb)
returns integer
language sql
immutable
as $$
  select case
    when value is not null and jsonb_typeof(value) = 'array' then jsonb_array_length(value)
    else 0
  end;
$$;

alter table if exists public.network_posts
  drop constraint if exists network_posts_has_content;

alter table if exists public.network_posts
  add constraint network_posts_has_content check (
    nullif(trim(coalesce(body, '')), '') is not null
    or nullif(trim(coalesce(shared_title, '')), '') is not null
    or public.network_post_attachment_count(attachment_urls) > 0
  );

drop policy if exists "Network post media readable by signed in users" on storage.objects;
create policy "Network post media readable by signed in users"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'network-post-media');

drop policy if exists "Users can upload own network post media" on storage.objects;
create policy "Users can upload own network post media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'network-post-media'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "Users can update own network post media" on storage.objects;
create policy "Users can update own network post media"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'network-post-media'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'network-post-media'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "Users can delete own network post media" on storage.objects;
create policy "Users can delete own network post media"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'network-post-media'
    and split_part(name, '/', 1) = auth.uid()::text
  );
