-- VetLearn My Drugs / My Monographs feature.
-- Run after admin_dashboard.sql and admin_user_types_notifications.sql.
-- Safe to re-run.

insert into public.app_features (feature_key, name, description, is_active, updated_at)
values (
  'my_drugs',
  'My Drugs / My Monographs',
  'Create, edit, search and share personal drug monographs.',
  true,
  now()
)
on conflict (feature_key) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.user_type_feature_access (user_type, feature_key, is_enabled)
select
  user_type,
  'my_drugs',
  is_enabled
from public.user_type_feature_access
where feature_key = 'my_monographs'
on conflict (user_type, feature_key) do update set
  is_enabled = excluded.is_enabled;

insert into public.user_type_feature_access (user_type, feature_key, is_enabled)
values
  ('free', 'my_drugs', false),
  ('clinician', 'my_drugs', true),
  ('professional', 'my_drugs', true),
  ('premium', 'my_drugs', true),
  ('admin', 'my_drugs', true),
  ('super_admin', 'my_drugs', true)
on conflict (user_type, feature_key) do nothing;

insert into public.subscription_feature_access (subscription_tier, feature_key, is_enabled)
select
  subscription_tier,
  'my_drugs',
  is_enabled
from public.subscription_feature_access
where feature_key = 'my_monographs'
on conflict (subscription_tier, feature_key) do update set
  is_enabled = excluded.is_enabled;

insert into public.subscription_feature_access (subscription_tier, feature_key, is_enabled)
select tier, 'my_drugs', tier <> 'free'::public.subscription_tier
from public.subscription_plans
on conflict (subscription_tier, feature_key) do nothing;

alter table public.drugs enable row level security;
alter table public.drugs
  add column if not exists custom_details jsonb not null default '{}'::jsonb;

drop policy if exists "Authenticated users can read available drugs" on public.drugs;
create policy "Authenticated users can read available drugs"
  on public.drugs for select
  to authenticated
  using (user_id is null or user_id = auth.uid());

drop policy if exists "Users can create their own monographs" on public.drugs;
create policy "Users can create their own monographs"
  on public.drugs for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update their own monographs" on public.drugs;
create policy "Users can update their own monographs"
  on public.drugs for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete their own monographs" on public.drugs;
create policy "Users can delete their own monographs"
  on public.drugs for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "My Monographs feature gate" on public.drugs;
drop policy if exists "My Drugs feature gate" on public.drugs;
create policy "My Drugs feature gate"
  on public.drugs
  as restrictive
  for all
  to authenticated
  using (
    user_id is null
    or (user_id = auth.uid() and public.has_feature('my_drugs'))
  )
  with check (
    user_id = auth.uid()
    and public.has_feature('my_drugs')
  );
