-- Fixes formulary monographs showing raw JSON for clinical records.
-- The current UI already displays `title` and `description` nicely, so this
-- adds/fills those fields from the existing Supabase column names.

-- Drug warnings
alter table if exists public.drug_warnings
  add column if not exists title text,
  add column if not exists description text;

update public.drug_warnings
set
  title = coalesce(nullif(title, ''), warning_type, species, 'Warning'),
  description = coalesce(nullif(description, ''), warning_text, notes)
where
  title is null
  or title = ''
  or description is null
  or description = '';

-- Species warnings
alter table if exists public.species_warnings
  add column if not exists title text,
  add column if not exists description text;

update public.species_warnings
set
  title = coalesce(nullif(title, ''), species, warning_type, 'Species warning'),
  description = coalesce(nullif(description, ''), warning_text, notes)
where
  title is null
  or title = ''
  or description is null
  or description = '';

-- Adverse effects
alter table if exists public.adverse_effects
  add column if not exists title text,
  add column if not exists description text;

update public.adverse_effects
set
  title = coalesce(nullif(title, ''), effect_type, species, 'Adverse effect'),
  description = coalesce(nullif(description, ''), effect_text, notes)
where
  title is null
  or title = ''
  or description is null
  or description = '';

-- Contraindications
alter table if exists public.contraindications
  add column if not exists title text,
  add column if not exists description text;

update public.contraindications
set
  title = coalesce(nullif(title, ''), condition, contraindication, species, 'Contraindication'),
  description = coalesce(nullif(description, ''), reason, details, notes)
where
  title is null
  or title = ''
  or description is null
  or description = '';

-- Monitoring recommendations
alter table if exists public.monitoring_recommendations
  add column if not exists title text,
  add column if not exists description text;

update public.monitoring_recommendations
set
  title = coalesce(nullif(title, ''), parameter, monitoring_type, 'Monitoring'),
  description = coalesce(nullif(description, ''), recommendation, monitoring, notes)
where
  title is null
  or title = ''
  or description is null
  or description = '';

-- Drug interactions
alter table if exists public.drug_interactions
  add column if not exists title text,
  add column if not exists description text;

update public.drug_interactions
set
  title = coalesce(nullif(title, ''), interacting_drug, drug_b, 'Interaction'),
  description = coalesce(nullif(description, ''), interaction, mechanism, recommendation, notes)
where
  title is null
  or title = ''
  or description is null
  or description = '';

-- Drug information
alter table if exists public.drug_information
  add column if not exists title text,
  add column if not exists description text;

update public.drug_information
set
  title = coalesce(nullif(title, ''), section, information_type, 'Information'),
  description = coalesce(nullif(description, ''), content, information_text, summary, notes)
where
  title is null
  or title = ''
  or description is null
  or description = '';

-- Clinical pearls
alter table if exists public.clinical_pearls
  add column if not exists title text,
  add column if not exists description text;

update public.clinical_pearls
set
  title = coalesce(nullif(title, ''), category, species, 'Clinical pearl'),
  description = coalesce(nullif(description, ''), pearl, pearl_text, summary, notes)
where
  title is null
  or title = ''
  or description is null
  or description = '';
