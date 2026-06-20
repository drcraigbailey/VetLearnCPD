-- VetLearn Admin support: display as Admin and create a fresh user thread each time
-- Safe to re-run after admin_support_mailbox_and_plans.sql.

-- Existing Admin support/self-conversations should render as Admin in Messages,
-- not as the user's own profile name.
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

-- Start a fresh Admin support thread every time a user starts a new Admin message.
-- Empty threads remain hidden in the normal Messages list until a message is sent.
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
