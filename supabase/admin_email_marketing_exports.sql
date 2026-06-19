-- VetLearn admin email marketing export support.
-- Run after the admin dashboard setup SQL. Safe to re-run.

drop view if exists public.admin_user_overview;

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
  case
    when coalesce(r.role::text, 'user') in ('admin', 'super_admin') then r.role::text
    when r.role::text = 'clinician' then 'clinician'
    else coalesce(s.subscription_tier::text, 'free')
  end as user_type,
  coalesce(s.subscription_tier::text, 'free') as subscription_tier,
  coalesce(a.status, 'active') as account_status,
  a.reason as account_status_reason,
  a.updated_at as account_status_updated_at,
  case
    when lower(coalesce(u.raw_user_meta_data ->> 'marketing_emails_opt_in', 'false')) in ('true', 't', '1', 'yes') then true
    else false
  end as marketing_emails_opt_in,
  case
    when nullif(u.raw_user_meta_data ->> 'marketing_emails_opt_in_at', '') is not null
      then (u.raw_user_meta_data ->> 'marketing_emails_opt_in_at')::timestamptz
    else null
  end as marketing_emails_opt_in_at
from auth.users u
left join public.profiles p on p.id = u.id
left join public.admin_user_roles r on r.user_id = u.id and r.is_active = true
left join public.user_subscriptions s on s.user_id = u.id
left join public.user_account_status a on a.user_id = u.id;

grant select on public.admin_user_overview to authenticated;
