-- VetLearn security/admin updates.
-- Run after supabase/admin_dashboard.sql.

alter table if exists public.profiles
  add column if not exists status text not null default 'active',
  add column if not exists is_suspended boolean not null default false,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by uuid references auth.users(id),
  add column if not exists deleted_at timestamptz;

create table if not exists public.user_private_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ai_api_key_saved boolean not null default false,
  ai_api_key_storage text not null default 'device',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_private_settings enable row level security;

drop policy if exists "Users can read own private settings" on public.user_private_settings;
create policy "Users can read own private settings" on public.user_private_settings
for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Users can update own private settings" on public.user_private_settings;
create policy "Users can update own private settings" on public.user_private_settings
for all using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

create or replace function public.admin_set_user_status(target_user_id uuid, new_status text, reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_email text;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if new_status not in ('active', 'suspended', 'deleted') then
    raise exception 'Invalid user status';
  end if;

  select email into target_email from auth.users where id = target_user_id;

  insert into public.user_account_status (user_id, status, reason, updated_by, updated_at)
  values (target_user_id, new_status::public.account_status, reason, auth.uid(), now())
  on conflict (user_id) do update set
    status = excluded.status,
    reason = excluded.reason,
    updated_by = auth.uid(),
    updated_at = now();

  update public.profiles
  set status = new_status,
      is_suspended = new_status = 'suspended',
      suspended_at = case when new_status = 'suspended' then now() else null end,
      suspended_by = case when new_status = 'suspended' then auth.uid() else null end,
      deleted_at = case when new_status = 'deleted' then now() else deleted_at end
  where id = target_user_id;

  insert into public.admin_audit_logs (admin_user_id, action, target_user_id, details)
  values (
    auth.uid(),
    case when new_status = 'active' then 'user_active' when new_status = 'suspended' then 'user_suspended' else 'user_deleted' end,
    target_user_id,
    jsonb_build_object('email', target_email, 'reason', reason, 'status', new_status)
  );
end;
$$;

create or replace function public.current_user_is_suspended()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_account_status
    where user_id = auth.uid()
      and status in ('suspended', 'disabled', 'deleted')
  ) or exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (is_suspended = true or status in ('suspended', 'deleted') or deleted_at is not null)
  );
$$;
