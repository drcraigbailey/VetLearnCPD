-- VetLearn protocol drug dose storage.
-- Run this in Supabase SQL Editor before saving protocol-specific doses.
-- Existing protocols keep using drug_ids; this adds optional per-drug dose details.

alter table public.protocols
  add column if not exists drug_doses jsonb not null default '{}'::jsonb;

update public.protocols
set drug_doses = '{}'::jsonb
where drug_doses is null;
