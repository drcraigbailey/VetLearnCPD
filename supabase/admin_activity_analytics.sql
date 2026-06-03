-- VetLearn Admin Activity Analytics
-- Run this after supabase/admin_dashboard.sql.
-- It powers Admin > Analytics with all-user and individual-user facts.

create table if not exists public.site_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  path text not null,
  title text,
  section text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer not null default 0,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists site_activity_events_user_created_idx on public.site_activity_events(user_id, created_at desc);
create index if not exists site_activity_events_path_idx on public.site_activity_events(path);
create index if not exists site_activity_events_section_idx on public.site_activity_events(section);

alter table public.site_activity_events enable row level security;

drop policy if exists "Users can insert own site activity" on public.site_activity_events;
create policy "Users can insert own site activity"
  on public.site_activity_events for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own site activity" on public.site_activity_events;
create policy "Users can read own site activity"
  on public.site_activity_events for select
  using (auth.uid() = user_id or public.is_admin());

create table if not exists public.file_upload_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  file_name text,
  file_type text,
  file_size bigint,
  context text,
  storage_path text,
  created_at timestamptz not null default now()
);

create index if not exists file_upload_events_user_created_idx on public.file_upload_events(user_id, created_at desc);
create index if not exists file_upload_events_context_idx on public.file_upload_events(context);

alter table public.file_upload_events enable row level security;

drop policy if exists "Users can insert own file uploads" on public.file_upload_events;
create policy "Users can insert own file uploads"
  on public.file_upload_events for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own file uploads" on public.file_upload_events;
create policy "Users can read own file uploads"
  on public.file_upload_events for select
  using (auth.uid() = user_id or public.is_admin());

create or replace function public.admin_activity_analytics(target_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  facts jsonb := '{}'::jsonb;
  section_usage jsonb := '[]'::jsonb;
  calculator_usage jsonb := '[]'::jsonb;
  audit_category_usage jsonb := '[]'::jsonb;
  audit_logs jsonb := '[]'::jsonb;
  page_visits jsonb := '[]'::jsonb;
  time_by_section jsonb := '[]'::jsonb;
  upload_contexts jsonb := '[]'::jsonb;
  selected_user uuid := target_user_id;
  cpd_count integer := 0;
  case_count integer := 0;
  protocol_count integer := 0;
  calculator_count integer := 0;
  formulary_count integer := 0;
  message_count integer := 0;
  vault_count integer := 0;
  network_count integer := 0;
  page_visit_count integer := 0;
  total_time_seconds integer := 0;
  file_upload_count integer := 0;
  total_upload_bytes bigint := 0;
  audit_count integer := 0;
  has_requester boolean := false;
  has_user1 boolean := false;
  has_user2 boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if to_regclass('public.cpd_reading') is not null then
    if selected_user is null then
      execute 'select count(*) from public.cpd_reading' into cpd_count;
    else
      execute 'select count(*) from public.cpd_reading where user_id = $1' into cpd_count using selected_user;
    end if;
  end if;

  if to_regclass('public.caselogs') is not null then
    if selected_user is null then
      execute 'select count(*) from public.caselogs' into case_count;
    else
      execute 'select count(*) from public.caselogs where user_id = $1' into case_count using selected_user;
    end if;
  end if;

  if to_regclass('public.protocols') is not null then
    if selected_user is null then
      execute 'select count(*) from public.protocols' into protocol_count;
    else
      execute 'select count(*) from public.protocols where user_id = $1' into protocol_count using selected_user;
    end if;
  end if;

  if to_regclass('public.calculator_logs') is not null then
    if selected_user is null then
      execute 'select count(*) from public.calculator_logs' into calculator_count;
    else
      execute 'select count(*) from public.calculator_logs where user_id = $1' into calculator_count using selected_user;
    end if;
  end if;

  if to_regclass('public.recently_viewed') is not null then
    if selected_user is null then
      execute 'select count(*) from public.recently_viewed where item_type = ''drug''' into formulary_count;
    else
      execute 'select count(*) from public.recently_viewed where item_type = ''drug'' and user_id = $1' into formulary_count using selected_user;
    end if;
  end if;

  if to_regclass('public.messages') is not null then
    if selected_user is null then
      execute 'select count(*) from public.messages' into message_count;
    else
      execute 'select count(*) from public.messages where sender_id = $1 or recipient_id = $1' into message_count using selected_user;
    end if;
  end if;

  if to_regclass('public.vault_entries') is not null then
    if selected_user is null then
      execute 'select count(*) from public.vault_entries' into vault_count;
    else
      execute 'select count(*) from public.vault_entries where user_id = $1' into vault_count using selected_user;
    end if;
  end if;

  if to_regclass('public.connections') is not null then
    if selected_user is null then
      execute 'select count(*) from public.connections' into network_count;
    else
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'connections' and column_name = 'requester_id'
      ) into has_requester;
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'connections' and column_name = 'user1_id'
      ) into has_user1;
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'connections' and column_name = 'user2_id'
      ) into has_user2;

      if has_requester then
        execute 'select count(*) from public.connections where requester_id = $1 or receiver_id = $1' into network_count using selected_user;
      elsif has_user1 and has_user2 then
        execute 'select count(*) from public.connections where user1_id = $1 or user2_id = $1' into network_count using selected_user;
      else
        execute 'select count(*) from public.connections where receiver_id = $1' into network_count using selected_user;
      end if;
    end if;
  end if;

  if to_regclass('public.site_activity_events') is not null then
    if selected_user is null then
      execute 'select count(*), coalesce(sum(duration_seconds), 0)::int from public.site_activity_events' into page_visit_count, total_time_seconds;
      execute $sql$
        select coalesce(jsonb_agg(jsonb_build_object('name', title, 'value', total) order by total desc), '[]'::jsonb)
        from (
          select coalesce(nullif(title, ''), path, 'Unknown page') as title, count(*)::int as total
          from public.site_activity_events
          group by coalesce(nullif(title, ''), path, 'Unknown page')
          order by total desc
          limit 10
        ) usage
      $sql$ into page_visits;
      execute $sql$
        select coalesce(jsonb_agg(jsonb_build_object('name', section, 'value', seconds) order by seconds desc), '[]'::jsonb)
        from (
          select coalesce(nullif(section, ''), 'Other') as section, coalesce(sum(duration_seconds), 0)::int as seconds
          from public.site_activity_events
          group by coalesce(nullif(section, ''), 'Other')
          order by seconds desc
          limit 10
        ) usage
      $sql$ into time_by_section;
    else
      execute 'select count(*), coalesce(sum(duration_seconds), 0)::int from public.site_activity_events where user_id = $1' into page_visit_count, total_time_seconds using selected_user;
      execute $sql$
        select coalesce(jsonb_agg(jsonb_build_object('name', title, 'value', total) order by total desc), '[]'::jsonb)
        from (
          select coalesce(nullif(title, ''), path, 'Unknown page') as title, count(*)::int as total
          from public.site_activity_events
          where user_id = $1
          group by coalesce(nullif(title, ''), path, 'Unknown page')
          order by total desc
          limit 10
        ) usage
      $sql$ into page_visits using selected_user;
      execute $sql$
        select coalesce(jsonb_agg(jsonb_build_object('name', section, 'value', seconds) order by seconds desc), '[]'::jsonb)
        from (
          select coalesce(nullif(section, ''), 'Other') as section, coalesce(sum(duration_seconds), 0)::int as seconds
          from public.site_activity_events
          where user_id = $1
          group by coalesce(nullif(section, ''), 'Other')
          order by seconds desc
          limit 10
        ) usage
      $sql$ into time_by_section using selected_user;
    end if;
  elsif to_regclass('public.recently_viewed') is not null then
    if selected_user is null then
      execute 'select count(*) from public.recently_viewed' into page_visit_count;
      execute $sql$
        select coalesce(jsonb_agg(jsonb_build_object('name', title, 'value', total) order by total desc), '[]'::jsonb)
        from (
          select coalesce(nullif(title, ''), item_type, 'Unknown page') as title, count(*)::int as total
          from public.recently_viewed
          group by coalesce(nullif(title, ''), item_type, 'Unknown page')
          order by total desc
          limit 10
        ) usage
      $sql$ into page_visits;
    else
      execute 'select count(*) from public.recently_viewed where user_id = $1' into page_visit_count using selected_user;
      execute $sql$
        select coalesce(jsonb_agg(jsonb_build_object('name', title, 'value', total) order by total desc), '[]'::jsonb)
        from (
          select coalesce(nullif(title, ''), item_type, 'Unknown page') as title, count(*)::int as total
          from public.recently_viewed
          where user_id = $1
          group by coalesce(nullif(title, ''), item_type, 'Unknown page')
          order by total desc
          limit 10
        ) usage
      $sql$ into page_visits using selected_user;
    end if;
  end if;

  if to_regclass('public.file_upload_events') is not null then
    if selected_user is null then
      execute 'select count(*), coalesce(sum(file_size), 0) from public.file_upload_events' into file_upload_count, total_upload_bytes;
      execute $sql$
        select coalesce(jsonb_agg(jsonb_build_object('name', context, 'value', total) order by total desc), '[]'::jsonb)
        from (
          select coalesce(nullif(context, ''), 'General') as context, count(*)::int as total
          from public.file_upload_events
          group by coalesce(nullif(context, ''), 'General')
          order by total desc
          limit 8
        ) usage
      $sql$ into upload_contexts;
    else
      execute 'select count(*), coalesce(sum(file_size), 0) from public.file_upload_events where user_id = $1' into file_upload_count, total_upload_bytes using selected_user;
      execute $sql$
        select coalesce(jsonb_agg(jsonb_build_object('name', context, 'value', total) order by total desc), '[]'::jsonb)
        from (
          select coalesce(nullif(context, ''), 'General') as context, count(*)::int as total
          from public.file_upload_events
          where user_id = $1
          group by coalesce(nullif(context, ''), 'General')
          order by total desc
          limit 8
        ) usage
      $sql$ into upload_contexts using selected_user;
    end if;
  end if;

  if to_regclass('public.admin_audit_logs') is not null then
    select count(*)::int
    into audit_count
    from public.admin_audit_logs
    where selected_user is null
       or admin_user_id = selected_user
       or target_user_id = selected_user;

    select coalesce(jsonb_agg(to_jsonb(log_item) order by log_item.created_at desc), '[]'::jsonb)
    into audit_logs
    from (
      select id, admin_user_id, action, target_user_id, details, created_at
      from public.admin_audit_logs
      where selected_user is null
         or admin_user_id = selected_user
         or target_user_id = selected_user
      order by created_at desc
      limit 100
    ) log_item;

    select coalesce(jsonb_agg(jsonb_build_object('name', category, 'value', total) order by total desc), '[]'::jsonb)
    into audit_category_usage
    from (
      select
        case
          when action like '%role%' then 'Role'
          when action like '%feature%' then 'Feature'
          when action like '%announcement%' then 'Message'
          when action like '%suspended%' or action like '%active%' or action like '%delete%' then 'Account'
          else 'System'
        end as category,
        count(*)::int as total
      from public.admin_audit_logs
      where selected_user is null
         or admin_user_id = selected_user
         or target_user_id = selected_user
      group by 1
    ) grouped;
  end if;

  section_usage := jsonb_build_array(
    jsonb_build_object('name', 'CPD Tracker', 'value', cpd_count),
    jsonb_build_object('name', 'Case Logs', 'value', case_count),
    jsonb_build_object('name', 'Clinical Protocols', 'value', protocol_count),
    jsonb_build_object('name', 'Clinical Tools', 'value', calculator_count),
    jsonb_build_object('name', 'Formulary', 'value', formulary_count),
    jsonb_build_object('name', 'Messages', 'value', message_count),
    jsonb_build_object('name', 'Vault', 'value', vault_count),
    jsonb_build_object('name', 'Network', 'value', network_count)
  );

  if to_regclass('public.calculator_logs') is not null then
    if selected_user is null then
      execute $sql$
        select coalesce(jsonb_agg(jsonb_build_object('name', calculator_type, 'value', total) order by total desc), '[]'::jsonb)
        from (
          select coalesce(calculator_type, 'Unknown') as calculator_type, count(*)::int as total
          from public.calculator_logs
          group by coalesce(calculator_type, 'Unknown')
          order by total desc
          limit 8
        ) usage
      $sql$ into calculator_usage;
    else
      execute $sql$
        select coalesce(jsonb_agg(jsonb_build_object('name', calculator_type, 'value', total) order by total desc), '[]'::jsonb)
        from (
          select coalesce(calculator_type, 'Unknown') as calculator_type, count(*)::int as total
          from public.calculator_logs
          where user_id = $1
          group by coalesce(calculator_type, 'Unknown')
          order by total desc
          limit 8
        ) usage
      $sql$ into calculator_usage using selected_user;
    end if;
  end if;

  facts := jsonb_build_object(
    'page_visits', page_visit_count,
    'total_time_seconds', total_time_seconds,
    'file_uploads', file_upload_count,
    'uploaded_bytes', total_upload_bytes,
    'network_connections', network_count,
    'audit_events', audit_count,
    'messages', message_count,
    'cpd_records', cpd_count,
    'case_logs', case_count,
    'protocols', protocol_count
  );

  result := jsonb_build_object(
    'target_user_id', selected_user,
    'facts', facts,
    'section_usage', section_usage,
    'calculator_usage', calculator_usage,
    'audit_category_usage', audit_category_usage,
    'page_visits', page_visits,
    'time_by_section', time_by_section,
    'file_uploads_by_context', upload_contexts,
    'audit_logs', audit_logs
  );

  return result;
end;
$$;

grant execute on function public.admin_activity_analytics(uuid) to authenticated;
