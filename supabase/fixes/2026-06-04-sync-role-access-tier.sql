-- Fix admin role changes so user access changes at the same time.
-- Run this whole file in Supabase SQL Editor.
--
-- It does two things:
-- 1. Removes the accidental text overload that made PostgREST unable to choose
--    the right admin_set_user_role function.
-- 2. Updates role and feature checks so an active `clinician` role grants the
--    same feature access as the clinician tier, even if your live database does
--    not store subscription_tier on profiles.

drop function if exists public.admin_set_user_role(uuid, text);

create or replace function public.admin_set_user_role(
  target_user_id uuid,
  new_role public.admin_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_admin_role text;
  target_current_role text;
  next_role text := new_role::text;
  remaining_super_admins integer;
begin
  select aur.role::text
    into current_admin_role
  from public.admin_user_roles aur
  where aur.user_id = auth.uid()
    and aur.is_active = true
    and aur.role in ('admin'::public.admin_role, 'super_admin'::public.admin_role)
  order by case aur.role::text when 'super_admin' then 0 else 1 end
  limit 1;

  if current_admin_role is distinct from 'super_admin' then
    raise exception 'Only Super Admins can change user roles';
  end if;

  select aur.role::text
    into target_current_role
  from public.admin_user_roles aur
  where aur.user_id = target_user_id
    and aur.is_active = true
  order by case aur.role::text when 'super_admin' then 0 when 'admin' then 1 when 'clinician' then 2 else 3 end
  limit 1;

  if target_user_id = auth.uid()
     and target_current_role = 'super_admin'
     and next_role <> 'super_admin' then
    select count(*)
      into remaining_super_admins
    from public.admin_user_roles aur
    where aur.role = 'super_admin'::public.admin_role
      and aur.is_active = true
      and aur.user_id <> target_user_id;

    if remaining_super_admins = 0 then
      raise exception 'Keep at least one active Super Admin';
    end if;
  end if;

  update public.admin_user_roles
  set role = new_role,
      is_active = true
  where user_id = target_user_id;

  if not found then
    insert into public.admin_user_roles (user_id, role, is_active)
    values (target_user_id, new_role, true);
  end if;
end;
$$;

grant execute on function public.admin_set_user_role(uuid, public.admin_role) to authenticated;

create or replace function public.has_feature(feature text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  active_role text;
  effective_tier text := 'free';
  candidate_tier text;
begin
  select aur.role::text
    into active_role
  from public.admin_user_roles aur
  where aur.user_id = auth.uid()
    and aur.is_active = true
  order by case aur.role::text when 'super_admin' then 0 when 'admin' then 1 when 'clinician' then 2 else 3 end
  limit 1;

  if active_role in ('admin', 'super_admin') then
    return true;
  end if;

  if active_role = 'clinician' and exists (
    select 1
    from public.subscription_feature_access sfa
    where sfa.subscription_tier = 'clinician'
      and sfa.feature_key = feature
      and sfa.is_enabled = true
  ) then
    return true;
  end if;

  -- Support whichever tier storage exists in the live database. These checks
  -- use dynamic SQL so missing columns do not break the function.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'subscription_tier'
  ) then
    execute 'select subscription_tier::text from public.profiles where id = $1 limit 1'
      into candidate_tier
      using auth.uid();
    effective_tier := coalesce(candidate_tier, effective_tier);
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_subscriptions' and column_name = 'subscription_tier'
  ) then
    execute 'select subscription_tier::text from public.user_subscriptions where user_id = $1 limit 1'
      into candidate_tier
      using auth.uid();
    effective_tier := coalesce(candidate_tier, effective_tier);
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_subscriptions' and column_name = 'tier'
  ) then
    execute 'select tier::text from public.user_subscriptions where user_id = $1 limit 1'
      into candidate_tier
      using auth.uid();
    effective_tier := coalesce(candidate_tier, effective_tier);
  end if;

  return exists (
    select 1
    from public.subscription_feature_access sfa
    where sfa.subscription_tier = effective_tier
      and sfa.feature_key = feature
      and sfa.is_enabled = true
  );
end;
$$;

grant execute on function public.has_feature(text) to authenticated;
