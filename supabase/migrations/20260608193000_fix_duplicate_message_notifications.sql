-- Fix stale duplicate message notifications.
-- Some older DB triggers create message notifications with related_id = null
-- and related_record_id = conversation_id. The app-created notification uses
-- related_id = message_id. This migration marks both forms as read when the
-- conversation has no unread incoming messages left for that user.

create or replace function public.sync_message_notifications_read()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
  unread_count integer;
begin
  if new.is_read is not true then
    return new;
  end if;

  recipient := new.sender_id;

  select case
    when c.user1_id = new.sender_id then c.user2_id
    else