-- VetLearn UI messaging/read-state support
-- Run this in Supabase SQL Editor after pulling the app changes.

-- Message read state
alter table public.messages
add column if not exists is_read boolean not null default false;

alter table public.messages
add column if not exists read_at timestamptz;

create index if not exists messages_conversation_unread_idx
on public.messages (conversation_id, is_read, sender_id);

-- Notification read state and duplicate protection
alter table public.notifications
add column if not exists is_read boolean not null default false;

alter table public.notifications
add column if not exists read_at timestamptz;

alter table public.notifications
add column if not exists type text default 'general';

alter table public.notifications
add column if not exists title text default 'Notification';

alter table public.notifications
add column if not exists message text;

alter table public.notifications
add column if not exists related_id text;

create index if not exists notifications_user_unread_created_idx
on public.notifications (user_id, is_read, created_at desc);

create unique index if not exists notifications_unique_related_idx
on public.notifications (user_id, type, related_id)
where related_id is not null;

-- Read-state RLS support
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

-- Users can read messages in their own conversations.
drop policy if exists "Users can read their conversation messages" on public.messages;
create policy "Users can read their conversation messages"
on public.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
    and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
  )
);

-- Users can send messages in their own conversations.
drop policy if exists "Users can send conversation messages" on public.messages;
create policy "Users can send conversation messages"
on public.messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
    and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
  )
);

-- Users can mark incoming messages in their own conversations as read.
drop policy if exists "Users can update incoming message read state" on public.messages;
create policy "Users can update incoming message read state"
on public.messages
for update
to authenticated
using (
  sender_id <> auth.uid()
  and exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
    and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
  )
)
with check (
  sender_id <> auth.uid()
  and exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
    and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
  )
);

-- Security-definer helper used by the app when opening a conversation.
-- It only marks incoming messages as read when the signed-in user belongs to
-- that conversation, then clears the matching message notifications.
create or replace function public.mark_conversation_messages_read(conversation_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.conversations c
    where c.id = conversation_uuid
    and (c.user1_id = current_user_id or c.user2_id = current_user_id)
  ) then
    raise exception 'Conversation not found';
  end if;

  update public.messages m
  set is_read = true,
      read_at = coalesce(m.read_at, now())
  where m.conversation_id = conversation_uuid
    and m.sender_id <> current_user_id
    and coalesce(m.is_read, false) = false;

  update public.notifications n
  set is_read = true,
      read_at = coalesce(n.read_at, now())
  where n.user_id = current_user_id
    and n.type = 'message'
    and coalesce(n.is_read, false) = false
    and exists (
      select 1
      from public.messages m
      where m.conversation_id = conversation_uuid
        and m.id::text = n.related_id
    );
end;
$$;

grant execute on function public.mark_conversation_messages_read(uuid) to authenticated;

-- Users can manage only their own notifications.
drop policy if exists "Users can read own notifications" on public.notifications;
create policy "Users can read own notifications"
on public.notifications
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can update own notifications" on public.notifications;
create policy "Users can update own notifications"
on public.notifications
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete own notifications" on public.notifications;
create policy "Users can delete own notifications"
on public.notifications
for delete
to authenticated
using (user_id = auth.uid());

-- Allow authenticated app users to create notifications for message recipients.
drop policy if exists "Authenticated users can create notifications" on public.notifications;
create policy "Authenticated users can create notifications"
on public.notifications
for insert
to authenticated
with check (true);

-- Optional database-level message notifications. The app also creates notifications
-- when sending; this trigger protects direct database inserts and avoids duplicates
-- through notifications_unique_related_idx.
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_id uuid;
  sender_name text;
begin
  select
    case
      when c.user1_id = new.sender_id then c.user2_id
      else c.user1_id
    end
  into recipient_id
  from public.conversations c
  where c.id = new.conversation_id;

  if recipient_id is null then
    return new;
  end if;

  select coalesce(full_name, 'A colleague')
  into sender_name
  from public.profiles
  where id = new.sender_id;

  insert into public.notifications (user_id, type, title, message, related_id, is_read)
  values (
    recipient_id,
    'message',
    'New message',
    sender_name || ' sent you a message.',
    new.id::text,
    false
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_message_created_notify on public.messages;
create trigger on_message_created_notify
after insert on public.messages
for each row execute function public.notify_new_message();
