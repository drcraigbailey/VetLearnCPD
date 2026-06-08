-- Fix stale duplicate message notifications.
-- Older triggers can create conversation-level message notifications where:
--   related_id is null
--   related_record_id = conversation_id
-- The Edge Function creates message-level notifications where:
--   related_id = message_id
-- This cleanup marks stale conversation-level duplicates as read when there are
-- no unread incoming messages left in that conversation for that notification user.

update notifications n
set
  is_read = true,
  read_at = coalesce(n.read_at, now())
where n.type = 'message'
  and n.is_read = false
  and