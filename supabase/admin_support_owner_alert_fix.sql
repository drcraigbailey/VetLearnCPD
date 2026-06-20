-- VetLearn Admin support alerts fix
-- Run if Admin support messages open/send but Admin does not get in-app alerts.
-- This notifies admins when the support-thread owner sends a message,
-- even if that owner also has an admin role. Admin replies are not echoed back
-- to the Admin mailbox because their sender_id differs from status.user_id.

create or replace function public.notify_admin_support_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_name text;
  preview text;
  support_owner uuid;
begin
  select status.user_id
  into support_owner
  from public.admin_support_conversation_status status
  where status.conversation_id = new.conversation_id
  limit 1;

  if support_owner is null then
    return new;
  end if;

  -- Only the user-side/support-owner message should alert Admin.
  -- Admin replies in the mailbox should not create a new Admin alert.
  if new.sender_id is distinct from support_owner then
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

notify pgrst, 'reload schema';

select
  'admin support owner alerts' as check_name,
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'notify_admin_support_message_insert'
  ) as ok;
