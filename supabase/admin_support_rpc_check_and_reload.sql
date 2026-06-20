-- VetLearn Admin support RPC check and Supabase API schema reload
-- Run this in Supabase SQL Editor if Messages -> Admin still says to run the latest SQL.

-- 1) Make sure the required table exists.
create table if not exists public.admin_support_conversation_status (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'resolved', 'closed')),
  resolved_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.admin_support_conversation_status enable row level security;

drop policy if exists "Admins can manage admin support conversation status" on public.admin_support_conversation_status;
create policy "Admins can manage admin support conversation status"
  on public.admin_support_conversation_status for all
  using (public.is_admin())
  with check (public.is_admin());

-- 2) Ensure support conversations render as Admin.
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

-- 3) Recreate the user-facing RPC exactly as the app calls it.
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

-- 4) Force Supabase's API layer to reload the function list.
notify pgrst, 'reload schema';

-- 5) Show whether the function exists and has the expected zero-argument signature.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as returns,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_or_create_admin_support_conversation';
