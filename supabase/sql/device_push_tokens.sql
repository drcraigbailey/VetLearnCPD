-- Android/Firebase push token storage for VetLearn
-- Run this in Supabase SQL Editor before testing phone notifications.

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null,
  platform text,
  provider text not null default 'capacitor',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id, token)
);

create index if not exists device_push_tokens_user_id_idx
  on public.device_push_tokens(user_id);

create index if not exists device_push_tokens_token_idx
  on public.device_push_tokens(token);

alter table public.device_push_tokens enable row level security;

drop policy if exists "Users can read their own push tokens" on public.device_push_tokens;
create policy "Users can read their own push tokens"
  on public.device_push_tokens
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can register their own push tokens" on public.device_push_tokens;
create policy "Users can register their own push tokens"
  on public.device_push_tokens
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own push tokens" on public.device_push_tokens;
create policy "Users can update their own push tokens"
  on public.device_push_tokens
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own push tokens" on public.device_push_tokens;
create policy "Users can delete their own push tokens"
  on public.device_push_tokens
  for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.set_device_push_tokens_last_seen()
returns trigger
language plpgsql
as $$
begin
  new.last_seen_at = now();
  return new;
end;
$$;

drop trigger if exists set_device_push_tokens_last_seen on public.device_push_tokens;
create trigger set_device_push_tokens_last_seen
before update on public.device_push_tokens
for each row
execute function public.set_device_push_tokens_last_seen();
