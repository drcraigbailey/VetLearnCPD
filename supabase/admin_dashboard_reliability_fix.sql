-- VetLearn admin overview reliability patch
-- Run after supabase/admin_dashboard.sql and supabase/admin_user_types_notifications.sql.
-- Optional activity tables return null and are named in missing_objects instead of
-- causing the entire admin dashboard request to fail.

create or replace function public.admin_optional_table_count(qualified_table text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  relation regclass;
  total bigint;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  relation := to_regclass(qualified_table);
  if relation is null then
    return null;
  end if;

  execute format('select count(*) from %s', relation) into total;
  return total;
end;
$$;

revoke all on function public.admin_optional_table_count(text) from public;
grant execute on function public.admin_optional_table_count(text) to authenticated;

create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  total_users bigint;
  active_users bigint;
  suspended_users bigint;
  admin_users bigint;
  new_today bigint;
  new_week bigint;
  new_month bigint;
  cpd_entries bigint;
  case_logs bigint;
  protocols bigint;
  calculations bigint;
  posts bigint;
  messages bigint;
  connections bigint;
  notifications bigint;
  error_logs bigint;
  profiles bigint;
  users_by_role jsonb;
  users_by_tier jsonb;
  missing_objects text[] := array[]::text[];
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select count(*) into total_users from auth.users;
  select count(*) into active_users from public.admin_user_overview where account_status = 'active';
  select count(*) into suspended_users from public.admin_user_overview where account_status = 'suspended';
  select count(*) into admin_users from public.admin_user_overview where role in ('admin', 'super_admin');
  select count(*) into new_today from auth.users where created_at >= date_trunc('day', now());
  select count(*) into new_week from auth.users where created_at >= now() - interval '7 days';
  select count(*) into new_month from auth.users where created_at >= now() - interval '30 days';

  select coalesce(jsonb_object_agg(role, total), '{}'::jsonb)
  into users_by_role
  from (
    select coalesce(role, 'user') as role, count(*) as total
    from public.admin_user_overview
    group by coalesce(role, 'user')
  ) grouped_roles;

  select coalesce(jsonb_object_agg(tier, total), '{}'::jsonb)
  into users_by_tier
  from (
    select coalesce(subscription_tier, 'free') as tier, count(*) as total
    from public.admin_user_overview
    group by coalesce(subscription_tier, 'free')
  ) grouped_tiers;

  if to_regclass('public.cpd_entries') is not null then
    cpd_entries := public.admin_optional_table_count('public.cpd_entries');
  elsif to_regclass('public.cpd_reading') is not null then
    cpd_entries := public.admin_optional_table_count('public.cpd_reading');
  else
    missing_objects := array_append(missing_objects, 'public.cpd_entries or public.cpd_reading');
  end if;

  if to_regclass('public.caselogs') is not null then
    case_logs := public.admin_optional_table_count('public.caselogs');
  elsif to_regclass('public.case_logs') is not null then
    case_logs := public.admin_optional_table_count('public.case_logs');
  else
    missing_objects := array_append(missing_objects, 'public.caselogs or public.case_logs');
  end if;

  protocols := public.admin_optional_table_count('public.protocols');
  calculations := public.admin_optional_table_count('public.calculator_logs');

  if to_regclass('public.network_posts') is not null then
    posts := public.admin_optional_table_count('public.network_posts');
  elsif to_regclass('public.posts') is not null then
    posts := public.admin_optional_table_count('public.posts');
  else
    missing_objects := array_append(missing_objects, 'public.network_posts or public.posts');
  end if;

  messages := public.admin_optional_table_count('public.messages');
  connections := public.admin_optional_table_count('public.connections');
  notifications := public.admin_optional_table_count('public.notifications');
  error_logs := public.admin_optional_table_count('public.system_error_logs');
  profiles := public.admin_optional_table_count('public.profiles');

  if protocols is null then missing_objects := array_append(missing_objects, 'public.protocols'); end if;
  if calculations is null then missing_objects := array_append(missing_objects, 'public.calculator_logs'); end if;
  if messages is null then missing_objects := array_append(missing_objects, 'public.messages'); end if;
  if connections is null then missing_objects := array_append(missing_objects, 'public.connections'); end if;
  if notifications is null then missing_objects := array_append(missing_objects, 'public.notifications'); end if;
  if error_logs is null then missing_objects := array_append(missing_objects, 'public.system_error_logs'); end if;
  if profiles is null then missing_objects := array_append(missing_objects, 'public.profiles'); end if;

  return jsonb_build_object(
    'generated_at', now(),
    'missing_objects', to_jsonb(missing_objects),
    'users', jsonb_build_object(
      'total', total_users,
      'active', active_users,
      'suspended', suspended_users,
      'admins', admin_users,
      'new_today', new_today,
      'new_week', new_week,
      'new_month', new_month,
      'by_role', users_by_role,
      'by_tier', users_by_tier
    ),
    'learning', jsonb_build_object(
      'cpd_entries', cpd_entries,
      'case_logs', case_logs,
      'protocols', protocols,
      'calculations', calculations
    ),
    'community', jsonb_build_object(
      'posts', posts,
      'messages', messages,
      'connections', connections
    ),
    'system', jsonb_build_object(
      'notifications_sent', notifications,
      'messages_sent', messages,
      'error_logs', error_logs,
      'database_records',
        total_users
        + coalesce(profiles, 0)
        + coalesce(cpd_entries, 0)
        + coalesce(case_logs, 0)
        + coalesce(protocols, 0)
        + coalesce(posts, 0)
        + coalesce(messages, 0)
        + coalesce(notifications, 0)
    ),
    -- Flat compatibility keys for older dashboard builds.
    'total_users', total_users,
    'active_users', active_users,
    'suspended_users', suspended_users,
    'admins', admin_users,
    'new_week', new_week,
    'cpd_entries', cpd_entries,
    'case_logs', case_logs,
    'protocols', protocols,
    'posts', posts,
    'messages', messages,
    'connections', connections,
    'users_by_role', users_by_role,
    'users_by_tier', users_by_tier
  );
end;
$$;

revoke all on function public.admin_dashboard_stats() from public;
grant execute on function public.admin_dashboard_stats() to authenticated;

notify pgrst, 'reload schema';
