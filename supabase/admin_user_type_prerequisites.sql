-- VetLearn admin user type prerequisites
-- Run before admin_user_types_notifications.sql. Safe to re-run.

with ranked_roles as (
  select
    ctid,
    row_number() over (
      partition by user_id
      order by
        case role::text
          when 'super_admin' then 1
          when 'admin' then 2
          when 'clinician' then 3
          else 4
        end,
        is_active desc,
        created_at desc
    ) as row_number
  from public.admin_user_roles
)
delete from public.admin_user_roles roles
using ranked_roles ranked
where roles.ctid = ranked.ctid
  and ranked.row_number > 1;

create unique index if not exists admin_user_roles_user_id_unique
  on public.admin_user_roles (user_id);

with ranked_subscriptions as (
  select
    ctid,
    row_number() over (
      partition by user_id
      order by
        case status
          when 'active' then 1
          when 'trialing' then 2
          else 3
        end,
        created_at desc
    ) as row_number
  from public.user_subscriptions
)
delete from public.user_subscriptions subscriptions
using ranked_subscriptions ranked
where subscriptions.ctid = ranked.ctid
  and ranked.row_number > 1;

create unique index if not exists user_subscriptions_user_id_unique
  on public.user_subscriptions (user_id);

alter table if exists public.notifications add column if not exists related_id text;

with ranked_notifications as (
  select
    ctid,
    row_number() over (
      partition by user_id, type, related_id
      order by is_read asc, created_at desc
    ) as row_number
  from public.notifications
  where related_id is not null
)
delete from public.notifications notifications
using ranked_notifications ranked
where notifications.ctid = ranked.ctid
  and ranked.row_number > 1;
