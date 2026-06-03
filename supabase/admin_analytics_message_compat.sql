-- Optional compatibility helper for Admin > Analytics.
-- Run this before admin_activity_analytics.sql if your messages table does not already have recipient_id.
-- It keeps the analytics RPC compatible with conversation-based message schemas.

do $$
begin
  if to_regclass('public.messages') is not null then
    alter table public.messages
      add column if not exists recipient_id uuid references auth.users(id) on delete set null;
  end if;
end $$;
