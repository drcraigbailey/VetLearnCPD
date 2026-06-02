-- VetLearn CPD manual reading source + mobile push notification support.
-- Run this in Supabase SQL Editor.

alter table public.cpd_reading
  add column if not exists entry_source text default 'timer',
  add column if not exists manual_minutes integer;

update public.cpd_reading
set entry_source = coalesce(entry_source, 'timer')
where entry_source is null;

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text,
  provider text default 'capacitor',
  last_seen_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (user_id, token)
);

alter table public.device_push_tokens enable row level security;

drop policy if exists "Read own push tokens" on public.device_push_tokens;
create policy "Read own push tokens"
  on public.device_push_tokens
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Insert own push tokens" on public.device_push_tokens;
create policy "Insert own push tokens"
  on public.device_push_tokens
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Update own push tokens" on public.device_push_tokens;
create policy "Update own push tokens"
  on public.device_push_tokens
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Delete own push tokens" on public.device_push_tokens;
create policy "Delete own push tokens"
  on public.device_push_tokens
  for delete
  to authenticated
  using (auth.uid() = user_id);

create index if not exists idx_device_push_tokens_user_id on public.device_push_tokens (user_id);
create index if not exists idx_device_push_tokens_last_seen on public.device_push_tokens (last_seen_at desc);
