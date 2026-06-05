-- VetLearn CPD GDPR readiness audit queries.
-- Run sections in Supabase SQL Editor to inspect the live database.
-- This file does not modify data.

-- 1) Personal-data tables expected by the app, with RLS status.
with personal_data_tables(table_name) as (
  values
    ('admin_audit_logs'),
    ('admin_user_roles'),
    ('calculator_logs'),
    ('case_logs'),
    ('caselogs'),
    ('connections'),
    ('conversations'),
    ('cpd_entries'),
    ('cpd_reading'),
    ('cpd_shares'),
    ('dashboard_favourites'),
    ('device_push_tokens'),
    ('drugs'),
    ('file_upload_events'),
    ('messages'),
    ('notifications'),
    ('profiles'),
    ('protocol_saves'),
    ('protocols'),
    ('recently_viewed'),
    ('shared_cpd_records'),
    ('shared_records'),
    ('site_activity_events'),
    ('system_error_logs'),
    ('user_account_status'),
    ('user_feature_overrides'),
    ('user_preferences'),
    ('user_private_settings'),
    ('user_subscriptions'),
    ('vault_entries')
)
select
  pdt.table_name,
  case when c.relname is null then 'missing' else 'exists' end as table_status,
  coalesce(c.relrowsecurity, false) as rls_enabled,
  coalesce(c.relforcerowsecurity, false) as force_rls
from personal_data_tables pdt
left join pg_class c on c.relname = pdt.table_name
left join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
order by pdt.table_name;

-- 2) RLS policies on the same tables.
with personal_data_tables(table_name) as (
  values
    ('admin_audit_logs'), ('admin_user_roles'), ('calculator_logs'), ('case_logs'), ('caselogs'),
    ('connections'), ('conversations'), ('cpd_entries'), ('cpd_reading'), ('cpd_shares'),
    ('dashboard_favourites'), ('device_push_tokens'), ('drugs'), ('file_upload_events'),
    ('messages'), ('notifications'), ('profiles'), ('protocol_saves'), ('protocols'),
    ('recently_viewed'), ('shared_cpd_records'), ('shared_records'), ('site_activity_events'),
    ('system_error_logs'), ('user_account_status'), ('user_feature_overrides'), ('user_preferences'),
    ('user_private_settings'), ('user_subscriptions'), ('vault_entries')
)
select
  p.schemaname,
  p.tablename,
  p.policyname,
  p.cmd,
  p.roles,
  p.qual,
  p.with_check
from pg_policies p
join personal_data_tables pdt on pdt.table_name = p.tablename
where p.schemaname = 'public'
order by p.tablename, p.policyname;

-- 3) Admin server-side functions expected by the app.
select
  routine_name,
  security_type,
  data_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'admin_dashboard_stats',
    'admin_send_announcement',
    'admin_set_user_role',
    'admin_set_user_status',
    'admin_set_user_type',
    'current_admin_role',
    'has_feature',
    'is_admin',
    'is_super_admin'
  )
order by routine_name;

-- 4) Storage objects that are likely user-owned.
select
  bucket_id,
  owner,
  owner_id,
  count(*) as object_count
from storage.objects
group by bucket_id, owner, owner_id
order by object_count desc;

-- 5) Orphan check after deleting a user.
-- Replace the UUID below, then run this block after a deletion attempt.
-- select 'profiles' as table_name, count(*) from public.profiles where id = '00000000-0000-0000-0000-000000000000'
-- union all select 'user_preferences', count(*) from public.user_preferences where user_id = '00000000-0000-0000-0000-000000000000'
-- union all select 'cpd_reading', count(*) from public.cpd_reading where user_id = '00000000-0000-0000-0000-000000000000'
-- union all select 'case_logs', count(*) from public.case_logs where user_id = '00000000-0000-0000-0000-000000000000'
-- union all select 'caselogs', count(*) from public.caselogs where user_id = '00000000-0000-0000-0000-000000000000'
-- union all select 'messages_sent', count(*) from public.messages where sender_id = '00000000-0000-0000-0000-000000000000'
-- union all select 'messages_received', count(*) from public.messages where recipient_id = '00000000-0000-0000-0000-000000000000'
-- union all select 'notifications', count(*) from public.notifications where user_id = '00000000-0000-0000-0000-000000000000'
-- union all select 'protocols', count(*) from public.protocols where user_id = '00000000-0000-0000-0000-000000000000'
-- union all select 'vault_entries', count(*) from public.vault_entries where user_id = '00000000-0000-0000-0000-000000000000';
