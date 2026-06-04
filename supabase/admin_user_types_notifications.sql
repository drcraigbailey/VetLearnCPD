-- VetLearn admin user types, feature access and notification reliability
-- Run after the base admin dashboard SQL. Safe to re-run.

create table if not exists public.user_type_feature_access (
  user_type text not null check (user_type in ('free', 'clinician', 'professional', 'premium', 'admin', 'super_admin')),
  feature_key text not null references public.app_features(feature_key) on delete cascade,
  is_enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_type, feature_key)
);

alter table public.user_type_feature_access enable row level security;

drop policy if exists "Admins can read user type feature access" on public.user_type_feature_access;
create policy "Admins can read user type feature access"
  on public.user_type_feature_access for select
  using (public.current_admin_role() in ('admin', 'super_admin'));

drop policy if exists "Admins can manage user type feature access" on public.user_type_feature_access;
create policy "Admins can manage user type feature access"
  on public.user_type_feature_access for all
  using (public.current_admin_role() in ('admin', 'super_admin'))
  with check (public.current_admin_role() in ('admin', 'super_admin'));

insert into public.user_type_feature_access (user_type, feature_key, is_enabled)
select tier.user_type, feature.feature_key,
  case
    when tier.user_type in ('admin', 'super_admin') then true
    when tier.user_type in ('free', 'clinician', 'professional', 'premium') then coalesce(existing.is_enabled, tier.default_enabled)
    else false
  end
from (
  values
    ('free', false),
    ('clinician', true),
    ('professional', true),
    ('premium', true),
    ('admin', true),
    ('super_admin', true)
) as tier(user_type, default_enabled)
cross join public.app_features feature
left join public.subscription_feature_access existing
  on existing.subscription_tier::text = tier.user_type
 and existing.feature_key = feature.feature_key
on conflict (user_type, feature_key) do nothing;

create or replace view public.admin_feature_matrix as
select
  access.user_type,
  access.feature_key,
  feature.name,
  feature.description,
  access.is_enabled,
  access.updated_at,
  access.updated_by
from public.user_type_feature_access access
join public.app_features feature on feature.feature_key = access.feature_key;

grant select on public.admin_feature_matrix to authenticated;

create or replace function public.effective_user_type(target_user_id uuid default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_user uuid := coalesce(target_user_id, auth.uid());
  internal_role text;
  paid_tier text;
begin
  if selected_user is null then
    return 'free';
  end if;

  select role::text into internal_role
  from public.admin_user_roles
  where user_id = selected_user
    and is_active = true
  order by
    case role::text
      when 'super_admin' then 1
      when 'admin' then 2
      when 'clinician' then 3
      else 4
    end,
    created_at desc
  limit 1;

  if internal_role in ('super_admin', 'admin') then
    return internal_role;
  end if;

  select subscription_tier::text into paid_tier
  from public.user_subscriptions
  where user_id = selected_user
    and status in ('active', 'trialing')
  order by created_at desc
  limit 1;

  if paid_tier = 'enterprise' then
    return 'premium';
  end if;

  if paid_tier in ('free', 'clinician', 'professional', 'premium') then
    return paid_tier;
  end if;

  if internal_role = 'clinician' then
    return 'clinician';
  end if;

  return 'free';
end;
$$;

grant execute on function public.effective_user_type(uuid) to authenticated;

create or replace function public.has_feature(feature text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_type text := public.effective_user_type(auth.uid());
  override_enabled boolean;
  type_enabled boolean;
  tier_enabled boolean;
begin
  if auth.uid() is null then
    return false;
  end if;

  select is_enabled into override_enabled
  from public.user_feature_overrides
  where user_id = auth.uid()
    and feature_key = feature
  order by updated_at desc
  limit 1;

  if override_enabled is not null then
    return override_enabled;
  end if;

  select is_enabled into type_enabled
  from public.user_type_feature_access
  where user_type = resolved_type
    and feature_key = feature;

  if type_enabled is not null then
    return type_enabled;
  end if;

  select is_enabled into tier_enabled
  from public.subscription_feature_access
  where subscription_tier::text = resolved_type
    and feature_key = feature;

  return coalesce(tier_enabled, false);
end;
$$;

grant execute on function public.has_feature(text) to authenticated;

create or replace function public.admin_set_user_type(target_user_id uuid, new_user_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text := public.current_admin_role();
  existing_role text;
  remaining_super_admins integer;
  normal_role public.admin_role;
  normal_tier public.subscription_tier;
begin
  if actor_role not in ('admin', 'super_admin') then
    raise exception 'Admin access required';
  end if;

  if new_user_type not in ('free', 'clinician', 'professional', 'premium', 'admin', 'super_admin') then
    raise exception 'Unsupported user type';
  end if;

  select role::text into existing_role
  from public.admin_user_roles
  where user_id = target_user_id
    and is_active = true
  order by created_at desc
  limit 1;

  if new_user_type in ('admin', 'super_admin') and actor_role <> 'super_admin' then
    raise exception 'Only Super Admins can assign admin roles';
  end if;

  if existing_role in ('admin', 'super_admin') and new_user_type not in ('admin', 'super_admin') and actor_role <> 'super_admin' then
    raise exception 'Only Super Admins can remove admin roles';
  end if;

  if target_user_id = auth.uid() and existing_role = 'super_admin' and new_user_type <> 'super_admin' then
    raise exception 'You cannot remove your own Super Admin access';
  end if;

  if existing_role = 'super_admin' and new_user_type <> 'super_admin' then
    select count(*) into remaining_super_admins
    from public.admin_user_roles
    where role = 'super_admin'
      and is_active = true
      and user_id <> target_user_id;

    if remaining_super_admins < 1 then
      raise exception 'At least one Super Admin must remain';
    end if;
  end if;

  if new_user_type in ('admin', 'super_admin') then
    insert into public.admin_user_roles (user_id, role, assigned_by, is_active)
    values (target_user_id, new_user_type::public.admin_role, auth.uid(), true)
    on conflict (user_id) do update
      set role = excluded.role,
          assigned_by = excluded.assigned_by,
          is_active = true,
          updated_at = now();

    insert into public.user_subscriptions (user_id, subscription_tier, status)
    values (target_user_id, 'free'::public.subscription_tier, 'active')
    on conflict (user_id) do nothing;
  else
    normal_role := case when new_user_type = 'clinician' then 'clinician'::public.admin_role else 'user'::public.admin_role end;
    normal_tier := new_user_type::public.subscription_tier;

    insert into public.user_subscriptions (user_id, subscription_tier, status)
    values (target_user_id, normal_tier, 'active')
    on conflict (user_id) do update
      set subscription_tier = excluded.subscription_tier,
          status = 'active',
          updated_at = now();

    insert into public.admin_user_roles (user_id, role, assigned_by, is_active)
    values (target_user_id, normal_role, auth.uid(), true)
    on conflict (user_id) do update
      set role = excluded.role,
          assigned_by = excluded.assigned_by,
          is_active = true,
          updated_at = now();
  end if;

  insert into public.admin_audit_logs (admin_user_id, action, target_user_id, details)
  values (auth.uid(), 'user_type_changed', target_user_id, jsonb_build_object('user_type', new_user_type));
end;
$$;

grant execute on function public.admin_set_user_type(uuid, text) to authenticated;

create or replace view public.admin_user_overview as
select
  u.id as user_id,
  u.email,
  u.created_at,
  u.last_sign_in_at,
  p.full_name,
  p.title,
  p.practice_name,
  p.location,
  coalesce(r.role::text, 'user') as role,
  public.effective_user_type(u.id) as user_type,
  coalesce(s.subscription_tier::text, 'free') as subscription_tier,
  coalesce(a.status, 'active') as account_status,
  a.reason as account_status_reason,
  a.updated_at as account_status_updated_at
from auth.users u
left join public.profiles p on p.id = u.id
left join public.admin_user_roles r on r.user_id = u.id and r.is_active = true
left join public.user_subscriptions s on s.user_id = u.id
left join public.user_account_status a on a.user_id = u.id;

grant select on public.admin_user_overview to authenticated;

create or replace function public.admin_analytics_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  has_activity_events boolean;
  has_upload_events boolean;
  has_rpc boolean;
begin
  if public.current_admin_role() not in ('admin', 'super_admin') then
    raise exception 'Admin access required';
  end if;

  select to_regclass('public.site_activity_events') is not null into has_activity_events;
  select to_regclass('public.file_upload_events') is not null into has_upload_events;

  select exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'admin_activity_analytics'
  ) into has_rpc;

  return jsonb_build_object(
    'setup_complete', has_activity_events and has_upload_events and has_rpc,
    'site_activity_events', has_activity_events,
    'file_upload_events', has_upload_events,
    'admin_activity_analytics', has_rpc
  );
end;
$$;

grant execute on function public.admin_analytics_status() to authenticated;

alter table if exists public.notifications add column if not exists related_id text;
alter table if exists public.notifications add column if not exists read_at timestamptz;

create unique index if not exists notifications_user_type_related_unique
  on public.notifications (user_id, type, related_id)
  where related_id is not null;

alter table if exists public.notifications enable row level security;

drop policy if exists "Users can read own notifications" on public.notifications;
create policy "Users can read own notifications"
  on public.notifications for select
  using (user_id = auth.uid());

drop policy if exists "Users can update own notifications" on public.notifications;
create policy "Users can update own notifications"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete own notifications" on public.notifications;
create policy "Users can delete own notifications"
  on public.notifications for delete
  using (user_id = auth.uid());

drop policy if exists "Authenticated users can create notifications" on public.notifications;
create policy "Authenticated users can create notifications"
  on public.notifications for insert
  with check (auth.uid() is not null);

create or replace function public.create_deduped_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_related_id text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_id text;
  new_id text;
begin
  if p_user_id is null then
    return null;
  end if;

  if p_related_id is not null then
    select id::text into existing_id
    from public.notifications
    where user_id = p_user_id
      and type = p_type
      and related_id = p_related_id
    limit 1;
  end if;

  if existing_id is not null then
    update public.notifications
    set title = p_title,
        message = p_message,
        is_read = false,
        read_at = null,
        created_at = now()
    where id::text = existing_id
    returning id::text into new_id;
  else
    insert into public.notifications (user_id, type, title, message, is_read, related_id, created_at)
    values (p_user_id, p_type, p_title, p_message, false, p_related_id, now())
    returning id::text into new_id;
  end if;

  return new_id;
end;
$$;

grant execute on function public.create_deduped_notification(uuid, text, text, text, text) to authenticated;

create or replace function public.notify_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_id uuid;
begin
  select case
    when c.user1_id = new.sender_id then c.user2_id
    else c.user1_id
  end into recipient_id
  from public.conversations c
  where c.id = new.conversation_id;

  if recipient_id is not null and recipient_id <> new.sender_id then
    perform public.create_deduped_notification(
      recipient_id,
      'message',
      'New message',
      'You have a new VetLearn message.',
      new.id::text
    );
  end if;

  return new;
end;
$$;

create or replace function public.mark_message_notification_read()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_read = true and coalesce(old.is_read, false) = false then
    update public.notifications
    set is_read = true,
        read_at = now()
    where type = 'message'
      and related_id = new.id::text
      and is_read = false;
  end if;

  return new;
end;
$$;

create or replace function public.notify_connection_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending' then
    perform public.create_deduped_notification(
      new.receiver_id,
      'connection_request',
      'New colleague request',
      'Someone wants to connect with you on VetLearn.',
      new.id::text
    );
  else
    update public.notifications
    set is_read = true,
        read_at = now()
    where user_id = new.receiver_id
      and type = 'connection_request'
      and related_id = new.id::text
      and is_read = false;
  end if;

  if new.status = 'accepted' and (tg_op = 'INSERT' or coalesce(old.status, '') <> 'accepted') then
    perform public.create_deduped_notification(
      new.requester_id,
      'connection_accepted',
      'Colleague request accepted',
      'Your colleague request has been accepted.',
      new.id::text
    );
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.messages') is not null then
    drop trigger if exists vetlearn_notify_message_insert on public.messages;
    create trigger vetlearn_notify_message_insert
      after insert on public.messages
      for each row execute function public.notify_message_insert();

    drop trigger if exists vetlearn_mark_message_notification_read on public.messages;
    create trigger vetlearn_mark_message_notification_read
      after update of is_read on public.messages
      for each row execute function public.mark_message_notification_read();
  end if;

  if to_regclass('public.connections') is not null then
    drop trigger if exists vetlearn_notify_connection_change on public.connections;
    create trigger vetlearn_notify_connection_change
      after insert or update of status on public.connections
      for each row execute function public.notify_connection_change();
  end if;
end $$;