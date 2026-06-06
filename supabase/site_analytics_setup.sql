-- VetLearn Site Analytics setup
-- Run after the Admin Dashboard SQL so public.admin_user_roles exists.
-- Safe to run more than once.

create extension if not exists pgcrypto;

create table if not exists public.site_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  path text not null,
  title text,
  section text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.site_activity_events
  add column if not exists title text,
  add column if not exists section text,
  add column if not exists started_at timestamptz default now(),
  add column if not exists ended_at timestamptz,
  add column if not exists duration_seconds integer default 0,
  add column if not exists user_agent text,
  add column if not exists created_at timestamptz default now();

update public.site_activity_events
set duration_seconds = 0
where duration_seconds is null or duration_seconds < 0;

create index if not exists site_activity_events_user_created_idx
  on public.site_activity_events(user_id, created_at desc);
create index if not exists site_activity_events_created_idx
  on public.site_activity_events(created_at desc);
create index if not exists site_activity_events_path_idx
  on public.site_activity_events(path);
create index if not exists site_activity_events_section_idx
  on public.site_activity_events(section);

create table if not exists public.file_upload_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text,
  file_type text,
  file_size bigint,
  context text,
  storage_path text,
  created_at timestamptz not null default now()
);

create index if not exists file_upload_events_user_created_idx
  on public.file_upload_events(user_id, created_at desc);
create index if not exists file_upload_events_context_idx
  on public.file_upload_events(context);

alter table public.site_activity_events enable row level security;
alter table public.file_upload_events enable row level security;

drop policy if exists "Users can insert own site activity" on public.site_activity_events;
create policy "Users can insert own site activity"
  on public.site_activity_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own site activity" on public.site_activity_events;
create policy "Users can read own site activity"
  on public.site_activity_events
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.admin_user_roles aur
      where aur.user_id = auth.uid()
        and aur.is_active = true
        and aur.role in ('admin', 'super_admin')
    )
  );

drop policy if exists "Users can insert own file uploads" on public.file_upload_events;
create policy "Users can insert own file uploads"
  on public.file_upload_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own file uploads" on public.file_upload_events;
create policy "Users can read own file uploads"
  on public.file_upload_events
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.admin_user_roles aur
      where aur.user_id = auth.uid()
        and aur.is_active = true
        and aur.role in ('admin', 'super_admin')
    )
  );

grant select, insert on public.site_activity_events to authenticated;
grant select, insert on public.file_upload_events to authenticated;

create or replace function public.admin_activity_analytics(target_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  is_authorised boolean := false;
  facts jsonb := '{}'::jsonb;
  section_usage jsonb := '[]'::jsonb;
  calculator_usage jsonb := '[]'::jsonb;
  audit_category_usage jsonb := '[]'::jsonb;
  audit_logs jsonb := '[]'::jsonb;
  page_visits jsonb := '[]'::jsonb;
  time_by_section jsonb := '[]'::jsonb;
  upload_contexts jsonb := '[]'::jsonb;
  page_visit_count integer := 0;
  total_time_seconds bigint := 0;
  file_upload_count integer := 0;
  total_upload_bytes bigint := 0;
  audit_count integer := 0;
begin
  select exists (
    select 1
    from public.admin_user_roles aur
    where aur.user_id = auth.uid()
      and aur.is_active = true
      and aur.role in ('admin', 'super_admin')
  ) into is_authorised;

  if not is_authorised then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select
    count(*)::integer,
    coalesce(sum(duration_seconds), 0)::bigint
  into page_visit_count, total_time_seconds
  from public.site_activity_events
  where target_user_id is null or user_id = target_user_id;

  select coalesce(
    jsonb_agg(jsonb_build_object('name', page_name, 'value', total) order by total desc),
    '[]'::jsonb
  )
  into page_visits
  from (
    select coalesce(nullif(title, ''), nullif(path, ''), 'Unknown page') as page_name,
           count(*)::integer as total
    from public.site_activity_events
    where target_user_id is null or user_id = target_user_id
    group by 1
    order by total desc
    limit 12
  ) pages;

  select coalesce(
    jsonb_agg(jsonb_build_object('name', section_name, 'value', total) order by total desc),
    '[]'::jsonb
  )
  into section_usage
  from (
    select coalesce(nullif(section, ''), 'Other') as section_name,
           count(*)::integer as total
    from public.site_activity_events
    where target_user_id is null or user_id = target_user_id
    group by 1
    order by total desc
    limit 12
  ) sections;

  select coalesce(
    jsonb_agg(jsonb_build_object('name', section_name, 'value', seconds) order by seconds desc),
    '[]'::jsonb
  )
  into time_by_section
  from (
    select coalesce(nullif(section, ''), 'Other') as section_name,
           coalesce(sum(duration_seconds), 0)::bigint as seconds
    from public.site_activity_events
    where target_user_id is null or user_id = target_user_id
    group by 1
    order by seconds desc
    limit 12
  ) sections;

  select
    count(*)::integer,
    coalesce(sum(file_size), 0)::bigint
  into file_upload_count, total_upload_bytes
  from public.file_upload_events
  where target_user_id is null or user_id = target_user_id;

  select coalesce(
    jsonb_agg(jsonb_build_object('name', context_name, 'value', total) order by total desc),
    '[]'::jsonb
  )
  into upload_contexts
  from (
    select coalesce(nullif(context, ''), 'General') as context_name,
           count(*)::integer as total
    from public.file_upload_events
    where target_user_id is null or user_id = target_user_id
    group by 1
    order by total desc
    limit 10
  ) uploads;

  if to_regclass('public.calculator_logs') is not null then
    execute $query$
      select coalesce(
        jsonb_agg(jsonb_build_object('name', calculator_name, 'value', total) order by total desc),
        '[]'::jsonb
      )
      from (
        select coalesce(nullif(calculator_type, ''), 'Unknown') as calculator_name,
               count(*)::integer as total
        from public.calculator_logs
        where $1::uuid is null or user_id = $1
        group by 1
        order by total desc
        limit 10
      ) calculators
    $query$ into calculator_usage using target_user_id;
  end if;

  if to_regclass('public.admin_audit_logs') is not null then
    execute $query$
      select count(*)::integer
      from public.admin_audit_logs
      where $1::uuid is null or admin_user_id = $1 or target_user_id = $1
    $query$ into audit_count using target_user_id;

    execute $query$
      select coalesce(jsonb_agg(to_jsonb(item) order by item.created_at desc), '[]'::jsonb)
      from (
        select id, admin_user_id, action, target_user_id, details, created_at
        from public.admin_audit_logs
        where $1::uuid is null or admin_user_id = $1 or target_user_id = $1
        order by created_at desc
        limit 100
      ) item
    $query$ into audit_logs using target_user_id;

    execute $query$
      select coalesce(
        jsonb_agg(jsonb_build_object('name', category, 'value', total) order by total desc),
        '[]'::jsonb
      )
      from (
        select case
          when action like '%role%' then 'Role'
          when action like '%feature%' then 'Feature'
          when action like '%announcement%' then 'Message'
          when action like '%suspended%' or action like '%active%' or action like '%delete%' then 'Account'
          else 'System'
        end as category,
        count(*)::integer as total
        from public.admin_audit_logs
        where $1::uuid is null or admin_user_id = $1 or target_user_id = $1
        group by 1
      ) categories
    $query$ into audit_category_usage using target_user_id;
  end if;

  facts := jsonb_build_object(
    'page_visits', page_visit_count,
    'total_time_seconds', total_time_seconds,
    'file_uploads', file_upload_count,
    'uploaded_bytes', total_upload_bytes,
    'network_connections', 0,
    'messages', 0,
    'audit_events', audit_count
  );

  return jsonb_build_object(
    'target_user_id', target_user_id,
    'facts', facts,
    'section_usage', section_usage,
    'calculator_usage', calculator_usage,
    'audit_category_usage', audit_category_usage,
    'page_visits', page_visits,
    'time_by_section', time_by_section,
    'file_uploads_by_context', upload_contexts,
    'audit_logs', audit_logs
  );
end;
$$;

revoke all on function public.admin_activity_analytics(uuid) from public;
grant execute on function public.admin_activity_analytics(uuid) to authenticated;

create or replace function public.admin_analytics_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  is_authorised boolean := false;
begin
  select exists (
    select 1
    from public.admin_user_roles aur
    where aur.user_id = auth.uid()
      and aur.is_active = true
      and aur.role in ('admin', 'super_admin')
  ) into is_authorised;

  if not is_authorised then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'setup_complete',
      to_regclass('public.site_activity_events') is not null
      and to_regclass('public.file_upload_events') is not null
      and to_regprocedure('public.admin_activity_analytics(uuid)') is not null,
    'site_activity_events', to_regclass('public.site_activity_events') is not null,
    'file_upload_events', to_regclass('public.file_upload_events') is not null,
    'admin_activity_analytics', to_regprocedure('public.admin_activity_analytics(uuid)') is not null
  );
end;
$$;

revoke all on function public.admin_analytics_status() from public;
grant execute on function public.admin_analytics_status() to authenticated;
