-- VetLearn Admin Activity Analytics
-- Run this after supabase/admin_dashboard.sql.
-- It powers the Admin > Audit user selector, audit trail and usage charts.

create or replace function public.admin_activity_analytics(target_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  section_usage jsonb := '[]'::jsonb;
  calculator_usage jsonb := '[]'::jsonb;
  audit_category_usage jsonb := '[]'::jsonb;
  audit_logs jsonb := '[]'::jsonb;
  selected_user uuid := target_user_id;
  cpd_count integer := 0;
  case_count integer := 0;
  protocol_count integer := 0;
  calculator_count integer := 0;
  formulary_count integer := 0;
  message_count integer := 0;
  vault_count integer := 0;
  network_count integer := 0;
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
      execute 'select count(*) from public.messages where sender_id = $1' into message_count using selected_user;
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
      execute 'select count(*) from public.connections where requester_id = $1 or receiver_id = $1' into network_count using selected_user;
    end if;
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

  result := jsonb_build_object(
    'target_user_id', selected_user,
    'section_usage', section_usage,
    'calculator_usage', calculator_usage,
    'audit_category_usage', audit_category_usage,
    'audit_logs', audit_logs
  );

  return result;
end;
$$;

grant execute on function public.admin_activity_analytics(uuid) to authenticated;
