-- VetLearn Messages: group conversations and attachments
-- Run after the existing messaging/conversation tables exist. Safe to re-run.

alter table if exists public.conversations
  add column if not exists is_group boolean not null default false,
  add column if not exists title text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.messages
  add column if not exists attachments jsonb not null default '[]'::jsonb,
  add column if not exists read_at timestamptz;

alter table if exists public.notifications
  add column if not exists related_id text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists read_at timestamptz;

insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', false)
on conflict (id) do nothing;

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

drop policy if exists "Message participants can read attachments" on storage.objects;
create policy "Message participants can read attachments"
  on storage.objects for select
  using (
    bucket_id = 'message-attachments'
    and auth.uid() is not null
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or exists (
        select 1
        from public.conversation_participants cp
        where cp.conversation_id::text = split_part(name, '/', 1)
          and cp.user_id = auth.uid()
      )
      or public.is_admin()
    )
  );

drop policy if exists "Message participants can upload attachments" on storage.objects;
create policy "Message participants can upload attachments"
  on storage.objects for insert
  with check (
    bucket_id = 'message-attachments'
    and auth.uid() is not null
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or exists (
        select 1
        from public.conversation_participants cp
        where cp.conversation_id::text = split_part(name, '/', 1)
          and cp.user_id = auth.uid()
      )
      or public.is_admin()
    )
  );

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

create or replace function public.ensure_direct_conversation_participants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user1_id is not null then
    insert into public.conversation_participants (conversation_id, user_id)
    values (new.id, new.user1_id)
    on conflict do nothing;
  end if;

  if new.user2_id is not null then
    insert into public.conversation_participants (conversation_id, user_id)
    values (new.id, new.user2_id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists vetlearn_ensure_direct_conversation_participants on public.conversations;
create trigger vetlearn_ensure_direct_conversation_participants
  after insert or update of user1_id, user2_id on public.conversations
  for each row execute function public.ensure_direct_conversation_participants();

insert into public.conversation_participants (conversation_id, user_id)
select id, user1_id from public.conversations where user1_id is not null
on conflict do nothing;

insert into public.conversation_participants (conversation_id, user_id)
select id, user2_id from public.conversations where user2_id is not null
on conflict do nothing;

create or replace function public.create_group_conversation(participant_ids uuid[], conversation_title text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_uuid uuid;
  participant uuid;
  clean_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  select array_agg(distinct item)
  into clean_ids
  from unnest(coalesce(participant_ids, array[]::uuid[]) || auth.uid()) as item
  where item is not null;

  if array_length(clean_ids, 1) < 2 then
    raise exception 'Choose at least one recipient';
  end if;

  insert into public.conversations (user1_id, user2_id, is_group, title, created_by, updated_at)
  values (
    auth.uid(),
    (select item from unnest(clean_ids) item where item <> auth.uid() limit 1),
    array_length(clean_ids, 1) > 2,
    nullif(trim(conversation_title), ''),
    auth.uid(),
    now()
  )
  returning id into conversation_uuid;

  foreach participant in array clean_ids loop
    insert into public.conversation_participants (conversation_id, user_id)
    values (conversation_uuid, participant)
    on conflict do nothing;
  end loop;

  return conversation_uuid;
end;
$$;

grant execute on function public.create_group_conversation(uuid[], text) to authenticated;

create or replace function public.send_conversation_message(conversation_uuid uuid, message_body text default '', message_attachments jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  message_id uuid;
  clean_body text := coalesce(message_body, '');
  clean_attachments jsonb := coalesce(message_attachments, '[]'::jsonb);
begin
  if not public.is_conversation_participant(conversation_uuid, auth.uid()) then
    raise exception 'Conversation access denied';
  end if;

  if nullif(trim(clean_body), '') is null and jsonb_array_length(clean_attachments) = 0 then
    raise exception 'Message cannot be empty';
  end if;

  insert into public.messages (conversation_id, sender_id, content, attachments, is_read)
  values (conversation_uuid, auth.uid(), trim(clean_body), clean_attachments, false)
  returning id into message_id;

  update public.conversations
  set updated_at = now()
  where id = conversation_uuid;

  return message_id;
end;
$$;

grant execute on function public.send_conversation_message(uuid, text, jsonb) to authenticated;

create or replace function public.mark_conversation_messages_read(conversation_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_conversation_participant(conversation_uuid, auth.uid()) then
    raise exception 'Conversation access denied';
  end if;

  update public.messages
  set is_read = true,
      read_at = now()
  where conversation_id = conversation_uuid
    and sender_id <> auth.uid()
    and is_read = false;

  insert into public.conversation_participants (conversation_id, user_id, last_read_at)
  values (conversation_uuid, auth.uid(), now())
  on conflict (conversation_id, user_id) do update set
    last_read_at = excluded.last_read_at;
end;
$$;

grant execute on function public.mark_conversation_messages_read(uuid) to authenticated;

create or replace function public.notify_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_id uuid;
  recipient_ids uuid[];
  notification_id text;
  sender_name text;
  preview text;
  sender_is_admin_support boolean := false;
begin
  if to_regclass('public.admin_support_conversation_status') is not null then
    select exists (
      select 1
      from public.admin_support_conversation_status status
      join public.admin_user_roles aur on aur.user_id = new.sender_id
      where status.conversation_id = new.conversation_id
        and aur.is_active = true
        and aur.role in ('admin', 'super_admin')
    )
    into sender_is_admin_support;
  end if;

  if sender_is_admin_support then
    sender_name := 'Admin';
  else
    select coalesce(nullif(p.full_name, ''), u.email, 'A colleague')
    into sender_name
    from auth.users u
    left join public.profiles p on p.id = u.id
    where u.id = new.sender_id;
  end if;

  preview := left(coalesce(new.content, ''), 140);

  select array_agg(distinct cp.user_id)
  into recipient_ids
  from public.conversation_participants cp
  where cp.conversation_id = new.conversation_id
    and cp.user_id <> new.sender_id;

  if recipient_ids is null then
    select case
      when c.user1_id = new.sender_id then c.user2_id
      else c.user1_id
    end into recipient_id
    from public.conversations c
    where c.id = new.conversation_id;

    recipient_ids := array[recipient_id];
  end if;

  foreach recipient_id in array recipient_ids loop
    if recipient_id is not null and recipient_id <> new.sender_id then
      notification_id := public.create_deduped_notification(
        recipient_id,
        'message',
        'New message',
        coalesce(sender_name, 'A colleague') || case when preview <> '' then ': ' || preview else ' sent you a message.' end,
        new.id::text
      );

      update public.notifications
      set metadata = jsonb_build_object(
        'message_id', new.id,
        'conversation_id', new.conversation_id,
        'sender_id', new.sender_id,
        'route', '/messages?conversation=' || new.conversation_id::text
      )
      where id::text = notification_id;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists vetlearn_notify_message_insert on public.messages;
create trigger vetlearn_notify_message_insert
  after insert on public.messages
  for each row execute function public.notify_message_insert();
