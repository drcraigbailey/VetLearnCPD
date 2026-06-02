-- VetLearn Admin Dashboard / SaaS administration foundation
-- Run this in Supabase SQL Editor after your normal app tables exist.
-- It adds roles, feature flags, subscription foundations, announcements and audit logs.

create extension if not exists pgcrypto;

-- ---------- Enums ----------
do $$ begin
  create type public.admin_role as enum ('user', 'clinician', 'admin', 'super_admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.account_status as enum ('active', 'suspended', 'disabled', 'deleted');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.subscription_tier as enum ('free', 'clinician', 'professional', 'premium', 'enterprise');
exception when duplicate_object then null;
end $$;

-- ---------- Helpers ----------
create or replace function public.current_admin_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select aur.role::text
  from public.admin_user_roles aur
  where aur.user_id = auth.uid()
    and aur.is_active = true
    and aur.role in ('admin', 'super_admin')
  order by case aur.role when 'super_admin' then 1 when 'admin' then 2 else 3 end
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_admin_role() in ('admin', 'super_admin'), false);
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_admin_role() = 'super_admin', false);
$$;

-- ---------- Roles and account state ----------
create table if not exists public.admin_user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.admin_role not null default 'user',
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.user_account_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status public.account_status not null default 'active',
  reason text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  subscription_tier public.subscription_tier not null default 'free',
  status text not null default 'active',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Subscription and feature access ----------
create table if not exists public.subscription_plans (
  tier public.subscription_tier primary key,
  name text not null,
  description text,
  monthly_price_pence integer default 0,
  yearly_price_pence integer default 0,
  stripe_price_id_monthly text,
  stripe_price_id_yearly text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_features (
  feature_key text primary key,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscription_feature_access (
  subscription_tier public.subscription_tier not null references public.subscription_plans(tier) on delete cascade,
  feature_key text not null references public.app_features(feature_key) on delete cascade,
  is_enabled boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (subscription_tier, feature_key)
);

create table if not exists public.user_feature_overrides (
  user_id uuid not null references auth.users(id) on delete cascade,
  feature_key text not null references public.app_features(feature_key) on delete cascade,
  is_enabled boolean not null,
  reason text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (user_id, feature_key)
);

-- ---------- Admin communication, audit and system logs ----------
create table if not exists public.admin_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience text not null default 'all',
  delivery_channels text[] not null default array['in_app'],
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id),
  action text not null,
  target_user_id uuid references auth.users(id),
  details jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.system_error_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  severity text not null default 'error',
  source text,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.system_backups (
  id uuid primary key default gen_random_uuid(),
  backup_type text not null default 'manual',
  status text not null default 'completed',
  storage_path text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ---------- Seed subscription plans and features ----------
insert into public.subscription_plans (tier, name, description, sort_order)
values
  ('free', 'Free', 'Core CPD tracking and essential VetLearn features.', 1),
  ('clinician', 'Clinician', 'Clinical tools and clinician-focused workflows.', 2),
  ('professional', 'Professional', 'Expanded professional toolkit and collaboration.', 3),
  ('premium', 'Premium', 'Premium clinical, AI and learning features.', 4),
  ('enterprise', 'Enterprise', 'Practice or organisation-level access.', 5)
on conflict (tier) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.app_features (feature_key, name, description)
values
  ('clinical_tools', 'Clinical Tools', 'Dose, CRI, fluid, emergency and toxicology calculators.'),
  ('clinical_protocols', 'Clinical Protocols', 'Create and share treatment protocols.'),
  ('drug_database', 'Drug Database', 'Search formulary and clinical drug information.'),
  ('library', 'Library', 'Learning resources and saved reading.'),
  ('case_logs', 'Case Logs', 'Record and review clinical cases.'),
  ('messaging', 'Messaging', 'Secure colleague messaging.'),
  ('cpd_tracker', 'CPD Tracker', 'CPD recording, reflections and history.'),
  ('vault', 'Vault', 'Secure credential and note storage.'),
  ('ai_assistant', 'AI Assistant', 'AI support for clinical and learning workflows.')
on conflict (feature_key) do update set
  name = excluded.name,
  description = excluded.description;

insert into public.subscription_feature_access (subscription_tier, feature_key, is_enabled)
select tier, feature_key,
  case
    when tier = 'free' and feature_key in ('cpd_tracker', 'drug_database') then true
    when tier = 'clinician' and feature_key in ('cpd_tracker', 'drug_database', 'clinical_tools', 'clinical_protocols', 'case_logs', 'messaging') then true
    when tier in ('professional', 'premium', 'enterprise') then true
    else false
  end
from public.subscription_plans cross join public.app_features
on conflict (subscription_tier, feature_key) do nothing;

-- ---------- Views ----------
create or replace view public.admin_user_overview as
select
  u.id as user_id,
  u.email,
  u.created_at,
  u.last_sign_in_at,
  p.full_name,
  p.title,
  p.practice_name,
  coalesce(aur.role::text, 'user') as role,
  coalesce(uas.status::text, 'active') as account_status,
  coalesce(us.subscription_tier::text, 'free') as subscription_tier
from auth.users u
left join public.profiles p on p.id = u.id
left join public.admin_user_roles aur on aur.user_id = u.id and aur.is_active = true
left join public.user_account_status uas on uas.user_id = u.id
left join public.user_subscriptions us on us.user_id = u.id;

-- ---------- RPC functions ----------
create or replace function public.admin_set_user_role(target_user_id uuid, new_role public.admin_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  super_admin_count integer;
begin
  if not public.is_super_admin() then
    raise exception 'Only Super Admins can change admin roles';
  end if;

  select count(*) into super_admin_count
  from public.admin_user_roles
  where role = 'super_admin' and is_active = true;

  if new_role <> 'super_admin' and exists (
    select 1 from public.admin_user_roles
    where user_id = target_user_id and role = 'super_admin' and is_active = true
  ) and super_admin_count <= 1 then
    raise exception 'Cannot remove the last Super Admin';
  end if;

  insert into public.admin_user_roles (user_id, role, is_active, created_by, updated_at)
  values (target_user_id, new_role, true, auth.uid(), now())
  on conflict (user_id) do update set
    role = excluded.role,
    is_active = true,
    updated_at = now();

  insert into public.admin_audit_logs (admin_user_id, action, target_user_id, details)
  values (auth.uid(), 'role_changed', target_user_id, jsonb_build_object('new_role', new_role));
end;
$$;

create or replace function public.admin_send_announcement(announcement_title text, announcement_body text, audience text default 'all')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  announcement_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  insert into public.admin_announcements (title, body, audience, created_by)
  values (announcement_title, announcement_body, audience, auth.uid())
  returning id into announcement_id;

  insert into public.notifications (user_id, title, message, type, is_read, created_at)
  select auo.user_id, announcement_title, announcement_body, 'admin_announcement', false, now()
  from public.admin_user_overview auo
  where audience = 'all' or auo.subscription_tier = audience;

  insert into public.admin_audit_logs (admin_user_id, action, details)
  values (auth.uid(), 'announcement_sent', jsonb_build_object('announcement_id', announcement_id, 'audience', audience));

  return announcement_id;
end;
$$;

create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select jsonb_build_object(
    'users', jsonb_build_object(
      'total', (select count(*) from auth.users),
      'active', (select count(*) from public.admin_user_overview where account_status = 'active'),
      'new_today', (select count(*) from auth.users where created_at >= date_trunc('day', now())),
      'new_week', (select count(*) from auth.users where created_at >= now() - interval '7 days'),
      'new_month', (select count(*) from auth.users where created_at >= now() - interval '30 days'),
      'clinician', (select count(*) from public.admin_user_overview where role = 'clinician'),
      'premium', (select count(*) from public.admin_user_overview where subscription_tier in ('premium', 'enterprise')),
      'suspended', (select count(*) from public.admin_user_overview where account_status = 'suspended'),
      'admins', (select count(*) from public.admin_user_overview where role in ('admin', 'super_admin'))
    ),
    'learning', jsonb_build_object(
      'cpd_entries', (select count(*) from public.cpd_reading),
      'reading_records', (select count(*) from public.cpd_reading),
      'case_logs', (select count(*) from public.caselogs),
      'protocols', (select count(*) from public.protocols),
      'calculations', (select count(*) from public.calculator_logs),
      'most_used_tool', coalesce((select calculator_type from public.calculator_logs group by calculator_type order by count(*) desc limit 1), 'None yet'),
      'most_viewed_resource', coalesce((select title from public.recently_viewed where item_type = 'resource' group by title order by count(*) desc limit 1), 'None yet')
    ),
    'system', jsonb_build_object(
      'database_records', (
        (select count(*) from auth.users) +
        (select count(*) from public.profiles) +
        (select count(*) from public.cpd_reading) +
        (select count(*) from public.caselogs) +
        (select count(*) from public.protocols) +
        (select count(*) from public.messages) +
        (select count(*) from public.notifications)
      ),
      'storage_usage', 'Check Supabase Storage dashboard',
      'notifications_sent', (select count(*) from public.notifications),
      'messages_sent', (select count(*) from public.messages),
      'error_logs', (select count(*) from public.system_error_logs),
      'last_backup', (select created_at from public.system_backups order by created_at desc limit 1)
    )
  ) into result;

  return result;
end;
$$;

create or replace function public.has_feature(feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select ufo.is_enabled from public.user_feature_overrides ufo where ufo.user_id = auth.uid() and ufo.feature_key = feature),
    (select sfa.is_enabled
     from public.user_subscriptions us
     join public.subscription_feature_access sfa on sfa.subscription_tier = us.subscription_tier
     where us.user_id = auth.uid() and sfa.feature_key = feature),
    (select sfa.is_enabled
     from public.subscription_feature_access sfa
     where sfa.subscription_tier = 'free' and sfa.feature_key = feature),
    false
  );
$$;

-- ---------- RLS ----------
alter table public.admin_user_roles enable row level security;
alter table public.user_account_status enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.app_features enable row level security;
alter table public.subscription_feature_access enable row level security;
alter table public.user_feature_overrides enable row level security;
alter table public.admin_announcements enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.system_error_logs enable row level security;
alter table public.system_backups enable row level security;

drop policy if exists "Admins can read admin roles" on public.admin_user_roles;
create policy "Admins can read admin roles" on public.admin_user_roles for select using (public.is_admin() or user_id = auth.uid());

drop policy if exists "Super admins can manage admin roles" on public.admin_user_roles;
create policy "Super admins can manage admin roles" on public.admin_user_roles for all using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "Admins can manage user status" on public.user_account_status;
create policy "Admins can manage user status" on public.user_account_status for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Users can read own subscription" on public.user_subscriptions;
create policy "Users can read own subscription" on public.user_subscriptions for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Admins can manage subscriptions" on public.user_subscriptions;
create policy "Admins can manage subscriptions" on public.user_subscriptions for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Everyone can read active subscription plans" on public.subscription_plans;
create policy "Everyone can read active subscription plans" on public.subscription_plans for select using (is_active = true or public.is_admin());

drop policy if exists "Admins can manage subscription plans" on public.subscription_plans;
create policy "Admins can manage subscription plans" on public.subscription_plans for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Everyone can read active app features" on public.app_features;
create policy "Everyone can read active app features" on public.app_features for select using (is_active = true or public.is_admin());

drop policy if exists "Admins can manage app features" on public.app_features;
create policy "Admins can manage app features" on public.app_features for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Everyone can read subscription feature access" on public.subscription_feature_access;
create policy "Everyone can read subscription feature access" on public.subscription_feature_access for select using (true);

drop policy if exists "Admins can manage subscription feature access" on public.subscription_feature_access;
create policy "Admins can manage subscription feature access" on public.subscription_feature_access for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Users can read own feature overrides" on public.user_feature_overrides;
create policy "Users can read own feature overrides" on public.user_feature_overrides for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Admins can manage user feature overrides" on public.user_feature_overrides;
create policy "Admins can manage user feature overrides" on public.user_feature_overrides for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can manage announcements" on public.admin_announcements;
create policy "Admins can manage announcements" on public.admin_announcements for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can read audit logs" on public.admin_audit_logs;
create policy "Admins can read audit logs" on public.admin_audit_logs for select using (public.is_admin());

drop policy if exists "Admins can insert audit logs" on public.admin_audit_logs;
create policy "Admins can insert audit logs" on public.admin_audit_logs for insert with check (public.is_admin());

drop policy if exists "Admins can read system error logs" on public.system_error_logs;
create policy "Admins can read system error logs" on public.system_error_logs for select using (public.is_admin());

drop policy if exists "Authenticated users can insert system error logs" on public.system_error_logs;
create policy "Authenticated users can insert system error logs" on public.system_error_logs for insert with check (auth.uid() is not null);

drop policy if exists "Admins can manage system backups" on public.system_backups;
create policy "Admins can manage system backups" on public.system_backups for all using (public.is_admin()) with check (public.is_admin());

-- ---------- First Super Admin setup ----------
-- After running the SQL, create your first Super Admin by replacing the email below.
-- Only run this once, from Supabase SQL Editor:
--
-- insert into public.admin_user_roles (user_id, role, is_active)
-- select id, 'super_admin', true
-- from auth.users
-- where email = 'YOUR_EMAIL_HERE'
-- on conflict (user_id) do update set role = 'super_admin', is_active = true, updated_at = now();
--
-- Promote a normal user later:
-- select public.admin_set_user_role('USER_UUID_HERE', 'admin');
--
-- Demote an admin later:
-- select public.admin_set_user_role('USER_UUID_HERE', 'user');
--
-- Recovery if locked out:
-- Run the first Super Admin insert again in Supabase SQL Editor with your email.
