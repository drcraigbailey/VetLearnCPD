-- VetLearn formulary warning display cleanup.
-- Run this in Supabase SQL Editor if formulary warnings show raw JSON.
-- It safely copies whichever warning/text column exists into description.

alter table if exists public.species_warnings add column if not exists description text;
alter table if exists public.drug_warnings add column if not exists description text;
alter table if exists public.contraindications add column if not exists description text;
alter table if exists public.adverse_effects add column if not exists description text;

do $$
begin
  if to_regclass('public.species_warnings') is not null then
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'species_warnings' and column_name = 'warning') then
      update public.species_warnings set description = warning where (description is null or description = '') and warning is not null and warning <> '';
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'species_warnings' and column_name = 'notes') then
      update public.species_warnings set description = notes where (description is null or description = '') and notes is not null and notes <> '';
    end if;
  end if;

  if to_regclass('public.drug_warnings') is not null then
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'drug_warnings' and column_name = 'warning_text') then
      update public.drug_warnings set description = warning_text where (description is null or description = '') and warning_text is not null and warning_text <> '';
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'drug_warnings' and column_name = 'warning') then
      update public.drug_warnings set description = warning where (description is null or description = '') and warning is not null and warning <> '';
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'drug_warnings' and column_name = 'notes') then
      update public.drug_warnings set description = notes where (description is null or description = '') and notes is not null and notes <> '';
    end if;
  end if;

  if to_regclass('public.contraindications') is not null then
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'contraindications' and column_name = 'contraindication') then
      update public.contraindications set description = contraindication where (description is null or description = '') and contraindication is not null and contraindication <> '';
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'contraindications' and column_name = 'details') then
      update public.contraindications set description = details where (description is null or description = '') and details is not null and details <> '';
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'contraindications' and column_name = 'notes') then
      update public.contraindications set description = notes where (description is null or description = '') and notes is not null and notes <> '';
    end if;
  end if;

  if to_regclass('public.adverse_effects') is not null then
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'adverse_effects' and column_name = 'effect') then
      update public.adverse_effects set description = effect where (description is null or description = '') and effect is not null and effect <> '';
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'adverse_effects' and column_name = 'adverse_effect') then
      update public.adverse_effects set description = adverse_effect where (description is null or description = '') and adverse_effect is not null and adverse_effect <> '';
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'adverse_effects' and column_name = 'notes') then
      update public.adverse_effects set description = notes where (description is null or description = '') and notes is not null and notes <> '';
    end if;
  end if;
end $$;
