-- VetLearn feature access hardening and Drug Calculator toggle.
-- Run this after supabase/admin_dashboard.sql.

insert into public.app_features (feature_key, name, description, is_active)
values
  ('drug_calculator', 'Drug Calculator', 'Weight-based dose and volume calculator inside Clinical Tools and Formulary.', true),
  ('network', 'Network', 'Professional network and colleague connections.', true)
on conflict (feature_key) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = true,
  updated_at = now();

insert into public.subscription_feature_access (subscription_tier, feature_key, is_enabled)
select
  tier,
  feature_key,
  case
    when feature_key = 'drug_calculator' and tier in ('clinician', 'professional', 'premium', 'enterprise') then true
    when feature_key = 'network' and tier in ('clinician', 'professional', 'premium', 'enterprise') then true
    else false
  end
from public.subscription_plans
cross join (values ('drug_calculator'), ('network')) as features(feature_key)
on conflict (subscription_tier, feature_key) do nothing;

update public.subscription_feature_access
set is_enabled = false,
    updated_at = now()
where subscription_tier = 'free'
  and feature_key in (
    'clinical_tools',
    'drug_calculator',
    'clinical_protocols',
    'library',
    'case_logs',
    'network',
    'messaging',
    'vault',
    'ai_assistant'
  );

create or replace function public.has_feature(feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_admin() then true
    else coalesce(
      (select false from public.app_features af where af.feature_key = feature and af.is_active = false),
      (select ufo.is_enabled from public.user_feature_overrides ufo where ufo.user_id = auth.uid() and ufo.feature_key = feature),
      (select sfa.is_enabled
       from public.user_subscriptions us
       join public.subscription_feature_access sfa on sfa.subscription_tier = us.subscription_tier
       where us.user_id = auth.uid() and sfa.feature_key = feature),
      (select sfa.is_enabled
       from public.subscription_feature_access sfa
       where sfa.subscription_tier = 'free' and sfa.feature_key = feature),
      false
    )
  end;
$$;

drop policy if exists "Everyone can read subscription feature access" on public.subscription_feature_access;
create policy "Everyone can read subscription feature access"
on public.subscription_feature_access
for select
using (auth.uid() is not null or public.is_admin());

drop policy if exists "Admins can manage subscription feature access" on public.subscription_feature_access;
create policy "Admins can manage subscription feature access"
on public.subscription_feature_access
for all
using (public.is_admin())
with check (public.is_admin());
