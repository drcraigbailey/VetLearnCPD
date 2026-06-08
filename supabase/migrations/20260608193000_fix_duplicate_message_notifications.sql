-- Fix stale duplicate message notifications.
-- Older triggers can create conversation-level message notifications where:
--   related_id is null
--   related_record_id = conversation_id
-- The Edge Function creates message-level notifications where:
--   related_id = message_id
-- This clears both once messages in that conversation have been read.

update notifications