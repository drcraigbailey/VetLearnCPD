-- VetLearn Admin support fresh-thread fix
-- Run after admin_support_rpc_runtime_fix.sql if Messages -> Admin still cannot open.
-- This avoids duplicate direct-conversation constraints by storing new Admin support
-- conversations as group-style threads owned by the user, with user2_id null.

alter table if exists public.conversations
  add column if not exists is_group boolean not null default false,
  add column if not exists title text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

-- Group conversations and Admin support threads do not need a second direct user.
alter table if exists public.conversations
  alter column user2_id drop not null;

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

alter table public.conversation_participants enable row level security;

drop policy if exists "Users can read own conversation participants" on public.conversation_participants;
create policy "Users can read own conversation participants"
  on public.conversation_participants for select
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.conversation_participants mine
      where mine.conversation_id = conversation_participants.conversation_id
        and mine.user_id = auth.uid()
    )
    or public.is_admin()
  );

drop policy if exists "Users can insert participants for own conversations" on public.conversation_participants;
create policy "Users can insert participants for own conversations"
  on public.conversation_participants for insert
  with check (
    auth.uid() is not null
    and (
      user_id = auth.uid()
      or exists (
        select 1
        from public.conversations c
        where c.id = conversation_id
          and c.created_by = auth.uid()
      )
      or public.is_admin()
    )
  );

drop policy if exists "Users can update own participant read state" on public.conversation_participants;
create policy "Users can update own participant read state"
  on public.conversation_participants for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

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

-- Mark existing self-conversations as Admin support so they render as Admin.
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

insert into public.conversation_participants (conversation_id, user_id)
select status.conversation_id, status.user_id
from public.admin_support_conversation_status status
where status.user_id is not null
on conflict do nothing;

-- Membership helper used by send_conversation_message.
create or replace function public.is_conversation_participant(conversation_uuid uuid, selected_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.conversation_participants cp
      where cp.conversation_id = conversation_uuid
        and cp.user_id = selected_user
    ),
    false
  )
  or coalesce(
    exists (
      select 1
      from public.conversations c
      where c.id = conversation_uuid
        and (c.user1_id = selected_user or c.user2_id = selected_user)
    ),
    false
  );
$$;

grant execute on function public.is_conversation_participant(uuid, uuid) to authenticated;

-- Exact RPC called by Messages -> Admin. Creates a fresh thread every time.
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
  values (auth.uid(), null, true, 'Admin', auth.uid(), now())
  returning id into conversation_uuid;

  insert into public.conversation_participants (conversation_id, user_id)
  values (conversation_uuid, auth.uid())
  on conflict do nothing;

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

notify pgrst, 'reload schema';

select
  'admin fresh thread rpc' as check_name,
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_or_create_admin_support_conversation'
      and pg_get_function_identity_arguments(p.oid) = ''
      and has_function_privilege('authenticated', p.oid, 'execute')
  ) as ok
union all
select
  'user2 nullable',
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversations'
      and column_name = 'user2_id'
      and is_nullable = 'YES'
  );
