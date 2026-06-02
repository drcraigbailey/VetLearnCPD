-- VetLearn Admin Dashboard prerequisite patch.
-- Run this BEFORE supabase/admin_dashboard.sql.
-- It safely adds optional columns the admin dashboard expects.

alter table if exists public.profiles
  add column if not exists title text,
  add column if not exists practice_name text;

alter table if exists public.notifications
  add column if not exists title text,
  add column if not exists message text,
  add column if not exists type text default 'general',
  add column if not exists is_read boolean default false,
  add column if not exists read_at timestamptz;
