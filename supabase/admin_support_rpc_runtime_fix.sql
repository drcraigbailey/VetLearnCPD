-- VetLearn Admin support RPC runtime fix
-- Run this if Messages -> Compose -> Admin still says: Could not open Admin message.
-- Safe to re-run.

-- Ensure the conversations table has the columns used by the Admin support RPC.
alter table if exists public.conversations
  add column if not exists is_group boolean not null default false,
  add column if not exists title text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.messages
  add column if not exists read_at timestamptz,
  add column if not exists attachments jsonb not null default '[]'::jsonb;

create table if not exists public.admin_support_conversation_status (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'resolved', 'closed')),
  resolved_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table if exists public.admin_support_conversation_status
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists status text not null default 'open',
  add column if not exists resolved_at timestamptz,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.admin_support_conversation_status enable row level security;

drop policy if exists "Admins can manage admin support conversation status" on public.admin_support_conversation_status;
create policy "Admins can manage admin support conversation status"
  on public.admin_support_conversation_status for all
  using (public.is_admin())
  with check (public.is_admin());

-- Existing self-conversations used for Admin support should show as Admin.
insert into public.admin_support_conversation_status (conversation_id, user_id, status, updated_by, updated_at)
select
  c.id,
  c.user1_id,
  'open',
  c.created_by,
  now()
from public.conversations c
where c.user1_id is not null
  and c.user1_id = c.user2_id
  and not exists (
    select 1
    from public.admin_support_conversation_status status
    where status.conversation_id = c.id
  );

update public.conversations c
set is_group = true,
    title = 'Admin',
    updated_at = coalesce(c.updated_at, now())
from public.admin_support_conversation_status status
where status.conversation_id = c.id
  and (c.is_group is distinct from true or c.title is distinct from 'Admin');

-- Recreate the exact RPC that the app calls.
create or replace function public.get_or_create_admin_support_conversation()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_uuid uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  insert into public.conversations (user1_id, user2_id, is_group, title, created_by, updated_at)
  values (auth.uid(), auth.uid(), true, 'Admin', auth.uid(), now())
  returning id into conversation_uuid;

  insert into public.admin_support_conversation_status (conversation_id, user_id, status, updated_by, updated_at)
  values (conversation_uuid, auth.uid(), 'open', auth.uid(), now())
  on conflict (conversation_id) do update set
    user_id = excluded.user_id,
    status = 'open',
    resolved_at = null,
    updated_by = excluded.updated_by,
    updated_at = now();

  return conversation_uuid;
end;
$$;

grant execute on function public.get_or_create_admin_support_conversation() to authenticated;

-- Force Supabase/PostgREST to reload the schema cache.
notify pgrst, 'reload schema';

-- Confirmation output.
select
  'conversations columns' as check_name,
  bool_and(column_name is not null) as ok
from (
  values ('is_group'), ('title'), ('created_by'), ('updated_at')
) expected(column_name)
where exists (
  select 1
  from information_schema.columns cols
  where cols.table_schema = 'public'
    and cols.table_name = 'conversations'
    and cols.column_name = expected.column_name
)
union all
select
  'admin support rpc',
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_or_create_admin_support_conversation'
      and pg_get_function_identity_arguments(p.oid) = ''
      and has_function_privilege('authenticated', p.oid, 'execute')
  );
