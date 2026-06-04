-- Fix admin role changes so user access changes at the same time.
-- Run this in Supabase SQL Editor, then changing a user between `user` and
-- `clinician` in the Admin Dashboard will also update their feature tier.
--
-- This also removes the accidental text overload. Supabase/PostgREST cannot
-- choose between admin_set_user_role(uuid, text) and
-- admin_set_user_role(uuid, public.admin_role), so only the enum version should
-- remain.

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
  set is_active = false
  where user_id = target_user_id
    and is_active = true;

  -- Keep an active role row for the admin dashboard overview, but access for
  -- normal users is controlled through profiles.subscription_tier below.
  insert into public.admin_user_roles (user_id, role, is_active)
  values (target_user_id, new_role, true);

  -- Feature access is driven by the user's subscription/access tier. Without
  -- this, the dropdown can say `clinician` while has_feature() still evaluates
  -- the account as `free`.
  if next_role = 'clinician' then
    update public.profiles
    set subscription_tier = 'clinician',
        updated_at = now()
    where id = target_user_id;
  elsif next_role = 'user' then
    update public.profiles
    set subscription_tier = 'free',
        updated_at = now()
    where id = target_user_id;
  elsif next_role in ('admin', 'super_admin') then
    update public.profiles
    set subscription_tier = coalesce(nullif(subscription_tier, 'free'), 'clinician'),
        updated_at = now()
    where id = target_user_id;
  end if;
end;
$$;

grant execute on function public.admin_set_user_role(uuid, public.admin_role) to authenticated;
