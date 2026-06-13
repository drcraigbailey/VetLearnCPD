-- My Drugs / My Monographs feature toggle seed
-- Run once in Supabase SQL editor so Admin Dashboard -> Features can toggle My Drugs by user type.

insert into public.user_type_feature_access (user_type, feature_key, is_enabled, updated_at)
values
  ('free', 'my_drugs', false, now()),
  ('clinician', 'my_drugs', false, now()),
  ('professional', 'my_drugs', true, now()),
  ('premium', 'my_drugs', true, now()),
  ('admin', 'my_drugs', true, now()),
  ('super_admin', 'my_drugs', true, now())
on conflict (user_type, feature_key)
do nothing;
