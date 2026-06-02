-- VetLearn formulary warning display cleanup.
-- Run this in Supabase SQL Editor if formulary warnings show raw JSON.
-- The app displays description/text fields; these updates copy existing warning fields into description.

alter table public.species_warnings
  add column if not exists description text;

update public.species_warnings
set description = coalesce(nullif(description, ''), nullif(warning, ''), nullif(warning_text, ''), nullif(notes, ''))
where description is null or description = '';

alter table public.drug_warnings
  add column if not exists description text;

update public.drug_warnings
set description = coalesce(nullif(description, ''), nullif(warning_text, ''), nullif(warning, ''), nullif(notes, ''))
where description is null or description = '';

alter table public.contraindications
  add column if not exists description text;

update public.contraindications
set description = coalesce(nullif(description, ''), nullif(contraindication, ''), nullif(details, ''), nullif(notes, ''))
where description is null or description = '';

alter table public.adverse_effects
  add column if not exists description text;

update public.adverse_effects
set description = coalesce(nullif(description, ''), nullif(effect, ''), nullif(adverse_effect, ''), nullif(notes, ''))
where description is null or description = '';
