-- VetLearn Admin Support mailbox, admin notifications and plan display controls
-- Run after admin_dashboard.sql and admin_user_types_notifications.sql.
-- Safe to re-run.

alter table if exists public.notifications
  add column if not exists related_id text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists read_at timestamptz;

alter table if exists public.messages
  add column if not exists read_at timestamptz;

alter table if exists public.messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table if exists public.conversations
  add column if not exists is_group boolean not null default false,
  add column if not exists title text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists notifications_user_type_related_unique
  on public.notifications (user_id, type, related_id)
  where related_id is not null;

alter table if exists public.subscription_plans
  add column if not exists monthly_price_pence integer default 0,
  add column if not exists yearly_price_pence integer default 0,
  add column if not exists is_active boolean not null default true,
  add column if not exists sort_order integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

drop policy if exists "Authenticated can read user type feature access for plans" on public.user_type_feature_access;
create policy "Authenticated can read user type feature access for plans"
  on public.user_type_feature_access for select
  using (auth.uid() is not null);

create table if not exists public.admin_support_settings (
  id text primary key default 'default' check (id = 'default'),
  support_user_id uuid not null references auth.users(id) on delete restrict,
  support_display_name text not null default 'Admin',
  is_active boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_support_conversation_status (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'resolved', 'closed')),
  resolved_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table if exists public.admin_support_conversation_status
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.admin_support_settings enable row level security;
alter table public.admin_support_conversation_status enable row level security;

update public.conversations c
set is_group = true,
    title = 'Admin',
    updated_at = coalesce(c.updated_at, now())
from public.admin_support_conversation_status status
where status.conversation_id = c.id
  and (c.is_group is distinct from true or c.title is distinct from 'Admin');

-- The Admin card is now virtual. Disable any previously configured real-user
-- support account so personal/super-admin conversations do not become Admin mail.
update public.admin_support_settings
set is_active = false,
    updated_at = now()
where id = 'default';

drop policy if exists "Admins can manage admin support settings" on public.admin_support_settings;
create policy "Admins can manage admin support settings"
  on public.admin_support_settings for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can manage admin support conversation status" on public.admin_support_conversation_status;
create policy "Admins can manage admin support conversation status"
  on public.admin_support_conversation_status for all
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.get_admin_support_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select support_user_id
  from public.admin_support_settings
  where id = 'default'
    and is_active = true
  limit 1;
$$;

grant execute on function public.get_admin_support_user_id() to authenticated;

create or replace function public.admin_set_support_user(support_user_id uuid, display_name text default 'Admin')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := coalesce(nullif(trim(display_name), ''), 'Admin');
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if support_user_id is null or not exists (select 1 from auth.users where id = support_user_id) then
    raise exception 'Choose an existing VetLearn user as Admin';
  end if;

  insert into public.admin_support_settings (id, support_user_id, support_display_name, is_active, updated_by, updated_at)
  values ('default', support_user_id, clean_name, true, auth.uid(), now())
  on conflict (id) do update set
    support_user_id = excluded.support_user_id,
    support_display_name = excluded.support_display_name,
    is_active = true,
    updated_by = excluded.updated_by,
    updated_at = now();

  insert into public.profiles (id, full_name, title, email, updated_at)
  select u.id, clean_name, 'VetLearn Support', u.email, now()
  from auth.users u
  where u.id = support_user_id
  on conflict (id) do update set
    full_name = excluded.full_name,
    title = excluded.title,
    email = coalesce(profiles.email, excluded.email),
    updated_at = now();
end;
$$;

grant execute on function public.admin_set_support_user(uuid, text) to authenticated;

create or replace function public.ensure_admin_support_for_user(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  support_user_id uuid := public.get_admin_support_user_id();
  link_id uuid;
begin
  if target_user_id is null or support_user_id is null or target_user_id = support_user_id then
    return false;
  end if;

  if not exists (select 1 from public.profiles where id = target_user_id) then
    return false;
  end if;

  if exists (
    select 1
    from public.connections
    where status = 'accepted'
      and (
        (requester_id = target_user_id and receiver_id = support_user_id)
        or (requester_id = support_user_id and receiver_id = target_user_id)
      )
  ) then
    return false;
  end if;

  insert into public.connections (requester_id, receiver_id, status)
  values (support_user_id, target_user_id, 'accepted')
  on conflict (requester_id, receiver_id) do update set status = 'accepted'
  returning id into link_id;

  delete from public.notifications
  where related_id = link_id::text
    and type in ('connection_request', 'connection_accepted');

  return true;
end;
$$;

grant execute on function public.ensure_admin_support_for_user(uuid) to authenticated;

create or replace function public.admin_backfill_admin_support_connections()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_row record;
  added_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if public.get_admin_support_user_id() is null then
    raise exception 'Set an Admin user first';
  end if;

  for profile_row in
    select id
    from public.profiles
    where id <> public.get_admin_support_user_id()
  loop
    if public.ensure_admin_support_for_user(profile_row.id) then
      added_count := added_count + 1;
    end if;
  end loop;

  return added_count;
end;
$$;

grant execute on function public.admin_backfill_admin_support_connections() to authenticated;

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

  select status.conversation_id
  into conversation_uuid
  from public.admin_support_conversation_status status
  join public.conversations c on c.id = status.conversation_id
  where status.user_id = auth.uid()
    and status.status <> 'closed'
  order by coalesce(c.updated_at, status.updated_at) desc
  limit 1;

  if conversation_uuid is not null then
    return conversation_uuid;
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

drop function if exists public.admin_get_or_create_support_conversation_for_user(uuid);
create or replace function public.admin_get_or_create_support_conversation_for_user(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_uuid uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if target_user_id is null or not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'Choose an existing VetLearn user';
  end if;

  select status.conversation_id
  into conversation_uuid
  from public.admin_support_conversation_status status
  join public.conversations c on c.id = status.conversation_id
  where status.user_id = target_user_id
    and status.status <> 'closed'
  order by coalesce(c.updated_at, status.updated_at) desc
  limit 1;

  if conversation_uuid is not null then
    return conversation_uuid;
  end if;

  insert into public.conversations (user1_id, user2_id, is_group, title, created_by, updated_at)
  values (target_user_id, target_user_id, true, 'Admin', auth.uid(), now())
  returning id into conversation_uuid;

  insert into public.admin_support_conversation_status (conversation_id, user_id, status, updated_by, updated_at)
  values (conversation_uuid, target_user_id, 'open', auth.uid(), now())
  on conflict (conversation_id) do update set
    user_id = excluded.user_id,
    status = 'open',
    resolved_at = null,
    updated_by = excluded.updated_by,
    updated_at = now();

  return conversation_uuid;
end;
$$;

grant execute on function public.admin_get_or_create_support_conversation_for_user(uuid) to authenticated;

create or replace function public.notify_admins_new_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  signup_name text;
  signup_email text;
begin
  signup_email := new.email;
  signup_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    signup_email,
    'A new user'
  );

  insert into public.notifications (user_id, type, title, message, related_id, metadata, is_read, created_at)
  select distinct
    aur.user_id,
    'admin_new_signup',
    'New user sign-up',
    signup_name || ' joined VetLearn.',
    new.id::text,
    jsonb_build_object(
      'user_id', new.id,
      'email', signup_email,
      'route', '/admin?tab=users'
    ),
    false,
    now()
  from public.admin_user_roles aur
  where aur.is_active = true
    and aur.role in ('admin', 'super_admin')
    and aur.user_id <> new.id
  on conflict (user_id, type, related_id) where related_id is not null do update set
    title = excluded.title,
    message = excluded.message,
    metadata = excluded.metadata,
    is_read = false,
    read_at = null,
    created_at = now();

  return new;
end;
$$;

drop trigger if exists vetlearn_notify_admins_new_signup on auth.users;
create trigger vetlearn_notify_admins_new_signup
  after insert on auth.users
  for each row execute function public.notify_admins_new_signup();

create or replace function public.ensure_admin_support_after_profile_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_admin_support_for_user(new.id);
  return new;
end;
$$;

drop trigger if exists vetlearn_ensure_admin_support_after_profile_insert on public.profiles;
create trigger vetlearn_ensure_admin_support_after_profile_insert
  after insert on public.profiles
  for each row execute function public.ensure_admin_support_after_profile_insert();

create or replace function public.notify_admin_support_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_name text;
  preview text;
begin
  if not exists (
    select 1
    from public.admin_support_conversation_status status
    where status.conversation_id = new.conversation_id
  ) then
    return new;
  end if;

  if exists (
    select 1
    from public.admin_user_roles aur
    where aur.user_id = new.sender_id
      and aur.is_active = true
      and aur.role in ('admin', 'super_admin')
  ) then
    return new;
  end if;

  select coalesce(nullif(p.full_name, ''), u.email, 'A user')
  into sender_name
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = new.sender_id;

  preview := left(coalesce(new.content, ''), 140);

  insert into public.notifications (user_id, type, title, message, related_id, metadata, is_read, created_at)
  select distinct
    aur.user_id,
    'admin_support_message',
    'New Admin message',
    coalesce(sender_name, 'A user') || case when preview <> '' then ': ' || preview else ' sent a support message.' end,
    new.id::text,
    jsonb_build_object(
      'message_id', new.id,
      'conversation_id', new.conversation_id,
      'sender_id', new.sender_id,
      'route', '/admin?tab=mailbox&conversation=' || new.conversation_id::text
    ),
    false,
    now()
  from public.admin_user_roles aur
  where aur.is_active = true
    and aur.role in ('admin', 'super_admin')
    and aur.user_id <> new.sender_id
  on conflict (user_id, type, related_id) where related_id is not null do update set
    title = excluded.title,
    message = excluded.message,
    metadata = excluded.metadata,
    is_read = false,
    read_at = null,
    created_at = now();

  return new;
end;
$$;

drop trigger if exists vetlearn_notify_admin_support_message_insert on public.messages;
create trigger vetlearn_notify_admin_support_message_insert
  after insert on public.messages
  for each row execute function public.notify_admin_support_message_insert();

create or replace view public.plan_feature_overview as
select
  plans.tier::text as tier,
  plans.name as plan_name,
  plans.description as plan_description,
  plans.monthly_price_pence,
  plans.yearly_price_pence,
  plans.is_active as plan_is_active,
  plans.sort_order,
  features.feature_key,
  features.name as feature_name,
  features.description as feature_description,
  features.is_active as feature_is_active,
  coalesce(type_access.is_enabled, tier_access.is_enabled, false) as is_enabled
from public.subscription_plans plans
cross join public.app_features features
left join public.user_type_feature_access type_access
  on type_access.user_type = plans.tier::text
  and type_access.feature_key = features.feature_key
left join public.subscription_feature_access tier_access
  on tier_access.subscription_tier = plans.tier
  and tier_access.feature_key = features.feature_key
where features.is_active = true
  and (plans.is_active = true or public.is_admin());

grant select on public.plan_feature_overview to authenticated;

create or replace view public.admin_support_mailbox as
with
support_conversations as (
  select
    c.id,
    c.user1_id,
    c.user2_id,
    c.updated_at,
    status.user_id,
    status.status,
    status.updated_at as status_updated_at
  from public.conversations c
  join public.admin_support_conversation_status status on status.conversation_id = c.id
),
last_messages as (
  select distinct on (m.conversation_id)
    m.conversation_id,
    m.id as last_message_id,
    m.sender_id as last_sender_id,
    m.content as last_message,
    m.created_at as last_message_at,
    m.is_read as last_message_read
  from public.messages m
  join support_conversations sc on sc.id = m.conversation_id
  order by m.conversation_id, m.created_at desc
)
select
  sc.id as conversation_id,
  sc.user_id,
  coalesce(nullif(p.full_name, ''), au.email, 'Unknown user') as sender_name,
  p.title as sender_title,
  au.email as sender_email,
  coalesce(sc.status, 'open') as status,
  lm.last_message_id,
  lm.last_sender_id,
  lm.last_message,
  lm.last_message_at,
  coalesce((
    select count(*)::integer
    from public.messages unread
    where unread.conversation_id = sc.id
      and not exists (
        select 1
        from public.admin_user_roles aur
        where aur.user_id = unread.sender_id
          and aur.is_active = true
          and aur.role in ('admin', 'super_admin')
      )
      and unread.is_read = false
  ), 0) as unread_count,
  sc.updated_at
from support_conversations sc
left join public.profiles p on p.id = sc.user_id
left join auth.users au on au.id = sc.user_id
left join last_messages lm on lm.conversation_id = sc.id
where public.is_admin();

grant select on public.admin_support_mailbox to authenticated;

drop function if exists public.admin_get_support_messages(uuid);
create or replace function public.admin_get_support_messages(conversation_uuid uuid)
returns table (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  content text,
  attachments jsonb,
  is_read boolean,
  created_at timestamptz,
  sender_name text,
  sender_is_admin boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if not exists (
    select 1
    from public.admin_support_conversation_status status
    where status.conversation_id = conversation_uuid
  ) then
    raise exception 'Support conversation not found';
  end if;

  return query
  select
    m.id,
    m.conversation_id,
    m.sender_id,
    m.content,
    coalesce(m.attachments, '[]'::jsonb) as attachments,
    m.is_read,
    m.created_at,
    case
      when exists (
        select 1
        from public.admin_user_roles aur
        where aur.user_id = m.sender_id
          and aur.is_active = true
          and aur.role in ('admin', 'super_admin')
      ) then 'Admin'
      else coalesce(nullif(p.full_name, ''), au.email, 'Unknown user')
    end as sender_name,
    exists (
      select 1
      from public.admin_user_roles aur
      where aur.user_id = m.sender_id
        and aur.is_active = true
        and aur.role in ('admin', 'super_admin')
    ) as sender_is_admin
  from public.messages m
  left join public.profiles p on p.id = m.sender_id
  left join auth.users au on au.id = m.sender_id
  where m.conversation_id = conversation_uuid
  order by m.created_at asc;
end;
$$;

grant execute on function public.admin_get_support_messages(uuid) to authenticated;

create or replace function public.admin_mark_support_conversation_read(conversation_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.messages
  set is_read = true,
      read_at = now()
  where conversation_id = conversation_uuid
    and not exists (
      select 1
      from public.admin_user_roles aur
      where aur.user_id = messages.sender_id
        and aur.is_active = true
        and aur.role in ('admin', 'super_admin')
    )
    and is_read = false;
end;
$$;

grant execute on function public.admin_mark_support_conversation_read(uuid) to authenticated;

drop function if exists public.admin_support_reply(uuid, text);
drop function if exists public.admin_support_reply(uuid, text, jsonb);
create or replace function public.admin_support_reply(conversation_uuid uuid, reply_body text, reply_attachments jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  message_id uuid;
  clean_attachments jsonb := coalesce(reply_attachments, '[]'::jsonb);
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if nullif(trim(reply_body), '') is null and jsonb_array_length(clean_attachments) = 0 then
    raise exception 'Reply cannot be empty';
  end if;

  if not exists (
    select 1
    from public.admin_support_conversation_status status
    where status.conversation_id = conversation_uuid
  ) then
    raise exception 'Support conversation not found';
  end if;

  insert into public.messages (conversation_id, sender_id, content, attachments, is_read)
  values (conversation_uuid, auth.uid(), trim(coalesce(reply_body, '')), clean_attachments, false)
  returning id into message_id;

  update public.conversations
  set updated_at = now()
  where id = conversation_uuid;

  insert into public.admin_support_conversation_status (conversation_id, status, updated_by, updated_at)
  values (conversation_uuid, 'open', auth.uid(), now())
  on conflict (conversation_id) do update set
    status = 'open',
    resolved_at = null,
    updated_by = excluded.updated_by,
    updated_at = now();

  return message_id;
end;
$$;

grant execute on function public.admin_support_reply(uuid, text, jsonb) to authenticated;

drop function if exists public.admin_delete_support_message(uuid);
create or replace function public.admin_delete_support_message(message_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_uuid uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select m.conversation_id
  into conversation_uuid
  from public.messages m
  join public.admin_support_conversation_status status on status.conversation_id = m.conversation_id
  where m.id = message_uuid
  limit 1;

  if conversation_uuid is null then
    raise exception 'Support message not found';
  end if;

  delete from public.messages
  where id = message_uuid;

  update public.conversations
  set updated_at = coalesce((
    select max(created_at)
    from public.messages
    where conversation_id = conversation_uuid
  ), now())
  where id = conversation_uuid;
end;
$$;

grant execute on function public.admin_delete_support_message(uuid) to authenticated;

drop function if exists public.admin_delete_support_conversation(uuid);
create or replace function public.admin_delete_support_conversation(conversation_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if not exists (
    select 1
    from public.admin_support_conversation_status status
    where status.conversation_id = conversation_uuid
  ) then
    raise exception 'Support conversation not found';
  end if;

  delete from public.messages
  where conversation_id = conversation_uuid;

  delete from public.admin_support_conversation_status
  where conversation_id = conversation_uuid;

  delete from public.conversations
  where id = conversation_uuid;
end;
$$;

grant execute on function public.admin_delete_support_conversation(uuid) to authenticated;

create or replace function public.admin_set_support_conversation_status(conversation_uuid uuid, next_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if next_status not in ('open', 'resolved', 'closed') then
    raise exception 'Unsupported support status';
  end if;

  insert into public.admin_support_conversation_status (conversation_id, status, resolved_at, updated_by, updated_at)
  values (
    conversation_uuid,
    next_status,
    case when next_status in ('resolved', 'closed') then now() else null end,
    auth.uid(),
    now()
  )
  on conflict (conversation_id) do update set
    status = excluded.status,
    resolved_at = excluded.resolved_at,
    updated_by = excluded.updated_by,
    updated_at = now();
end;
$$;

grant execute on function public.admin_set_support_conversation_status(uuid, text) to authenticated;

create or replace function public.admin_notify_group_attention(group_title text, group_message text, group_thread_id text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  related text := coalesce(nullif(group_thread_id, ''), gen_random_uuid()::text);
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  insert into public.notifications (user_id, type, title, message, related_id, metadata, is_read, created_at)
  select distinct
    aur.user_id,
    'admin_group_message',
    coalesce(nullif(trim(group_title), ''), 'Group message needs attention'),
    coalesce(nullif(trim(group_message), ''), 'A group/admin message needs admin attention.'),
    related,
    jsonb_build_object('thread_id', related, 'route', '/admin?tab=mailbox'),
    false,
    now()
  from public.admin_user_roles aur
  where aur.is_active = true
    and aur.role in ('admin', 'super_admin')
  on conflict (user_id, type, related_id) where related_id is not null do update set
    title = excluded.title,
    message = excluded.message,
    metadata = excluded.metadata,
    is_read = false,
    read_at = null,
    created_at = now();
end;
$$;

grant execute on function public.admin_notify_group_attention(text, text, text) to authenticated;
