-- VetLearn Admin Dashboard prerequisite patch.
-- Run this BEFORE supabase/admin_dashboard.sql.
-- It safely creates the minimum objects needed before the main admin script runs.

create extension if not exists pgcrypto;

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

alter table if exists public.profiles
  add column if not exists title text,
  add column if not exists practice_name text;

alter table if exists public.notifications
  add column if not exists title text,
  add column if not exists message text,
  add column if not exists type text default 'general',
  add column if not exists is_read boolean default false,
  add column if not exists read_at timestamptz;
