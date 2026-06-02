-- Run this if clinical_tools.sql fails with: column "species" does not exist.
-- It repairs older/partial calculator tables and seeds starter calculator data.

create table if not exists public.drug_calculators (id bigserial primary key, created_at timestamptz default now());
alter table public.drug_calculators
  add column if not exists drug_name text,
  add column if not exists species text,
  add column if not exists min_dose numeric,
  add column if not exists max_dose numeric,
  add column if not exists dose_unit text default 'mg/kg',
  add column if not exists route text,
  add column if not exists concentration numeric,
  add column if not exists concentration_unit text,
  add column if not exists notes text;

create table if not exists public.cri_protocols (id bigserial primary key, created_at timestamptz default now());
alter table public.cri_protocols
  add column if not exists drug_name text,
  add column if not exists indication text,
  add column if not exists loading_dose text,
  add column if not exists cri_rate_min numeric,
  add column if not exists cri_rate_max numeric,
  add column if not exists rate_unit text,
  add column if not exists concentration numeric,
  add column if not exists concentration_unit text,
  add column if not exists dilution text,
  add column if not exists monitoring text,
  add column if not exists notes text;

create table if not exists public.emergency_drug_calculator (id bigserial primary key, created_at timestamptz default now());
alter table public.emergency_drug_calculator
  add column if not exists drug_name text,
  add column if not exists indication text,
  add column if not exists dose_min numeric,
  add column if not exists dose_max numeric,
  add column if not exists dose_unit text,
  add column if not exists route text,
  add column if not exists concentration numeric,
  add column if not exists concentration_unit text,
  add column if not exists notes text;

create table if not exists public.fluid_calculators (id bigserial primary key, created_at timestamptz default now());
alter table public.fluid_calculators
  add column if not exists calculation_name text,
  add column if not exists formula text,
  add column if not exists species text,
  add column if not exists notes text;

create table if not exists public.transfusion_calculators (id bigserial primary key, created_at timestamptz default now());
alter table public.transfusion_calculators
  add column if not exists species text,
  add column if not exists blood_volume_factor numeric,
  add column if not exists notes text;

create table if not exists public.species_toxicities (id bigserial primary key, created_at timestamptz default now());
alter table public.species_toxicities
  add column if not exists toxin text,
  add column if not exists species text,
  add column if not exists toxic_dose text,
  add column if not exists clinical_signs text,
  add column if not exists antidote text,
  add column if not exists notes text;

create table if not exists public.calculator_logs (id bigserial primary key, created_at timestamptz default now());
alter table public.calculator_logs
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists calculator_type text,
  add column if not exists drug_name text,
  add column if not exists patient_weight numeric,
  add column if not exists result text;

alter table public.drug_calculators enable row level security;
alter table public.cri_protocols enable row level security;
alter table public.emergency_drug_calculator enable row level security;
alter table public.fluid_calculators enable row level security;
alter table public.transfusion_calculators enable row level security;
alter table public.species_toxicities enable row level security;
alter table public.calculator_logs enable row level security;

drop policy if exists "Read drug calculators" on public.drug_calculators;
create policy "Read drug calculators" on public.drug_calculators for select to authenticated using (true);

drop policy if exists "Read CRI protocols" on public.cri_protocols;
create policy "Read CRI protocols" on public.cri_protocols for select to authenticated using (true);

drop policy if exists "Read emergency calculator" on public.emergency_drug_calculator;
create policy "Read emergency calculator" on public.emergency_drug_calculator for select to authenticated using (true);

drop policy if exists "Read fluid calculators" on public.fluid_calculators;
create policy "Read fluid calculators" on public.fluid_calculators for select to authenticated using (true);

drop policy if exists "Read transfusion calculators" on public.transfusion_calculators;
create policy "Read transfusion calculators" on public.transfusion_calculators for select to authenticated using (true);

drop policy if exists "Read species toxicities" on public.species_toxicities;
create policy "Read species toxicities" on public.species_toxicities for select to authenticated using (true);

drop policy if exists "Read own calculator logs" on public.calculator_logs;
create policy "Read own calculator logs" on public.calculator_logs for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Insert own calculator logs" on public.calculator_logs;
create policy "Insert own calculator logs" on public.calculator_logs for insert to authenticated with check (auth.uid() = user_id);

create index if not exists idx_drug_calculators_lookup on public.drug_calculators (species, drug_name);
create index if not exists idx_cri_protocols_drug on public.cri_protocols (drug_name);
create index if not exists idx_emergency_drugs_lookup on public.emergency_drug_calculator (drug_name);
create index if not exists idx_fluid_calculators_species on public.fluid_calculators (species, calculation_name);
create index if not exists idx_species_toxicities_lookup on public.species_toxicities (species, toxin);
create index if not exists idx_calculator_logs_user_created on public.calculator_logs (user_id, created_at desc);

insert into public.drug_calculators (drug_name, species, min_dose, max_dose, dose_unit, route, concentration, concentration_unit, notes)
select * from (values
  ('Meloxicam', 'Dog', 0.1::numeric, 0.2::numeric, 'mg/kg', 'PO', 1.5::numeric, 'mg/ml', 'Use current formulary guidance for duration and patient risk factors.'),
  ('Meloxicam', 'Cat', 0.05::numeric, 0.05::numeric, 'mg/kg', 'PO', 0.5::numeric, 'mg/ml', 'Use with caution and current local guidance.'),
  ('Methadone', 'Dog', 0.2::numeric, 0.4::numeric, 'mg/kg', 'IV/IM', 10::numeric, 'mg/ml', 'Monitor sedation and respiratory status.'),
  ('Buprenorphine', 'Cat', 0.01::numeric, 0.02::numeric, 'mg/kg', 'IV/IM/Buccal', 0.3::numeric, 'mg/ml', 'Dose route and formulation dependent.')
) as seed(drug_name, species, min_dose, max_dose, dose_unit, route, concentration, concentration_unit, notes)
where not exists (
  select 1 from public.drug_calculators existing
  where existing.drug_name = seed.drug_name and existing.species = seed.species and coalesce(existing.route, '') = coalesce(seed.route, '')
);

insert into public.cri_protocols (drug_name, indication, loading_dose, cri_rate_min, cri_rate_max, rate_unit, concentration, concentration_unit, dilution, monitoring, notes)
select * from (values
  ('Lidocaine', 'Analgesia / ventricular arrhythmia support', null, 25::numeric, 75::numeric, 'mcg/kg/min', 20::numeric, 'mg/ml', 'Dilute to local protocol.', 'ECG, blood pressure, mentation, adverse CNS signs.', 'Avoid or use extreme caution in cats unless specifically indicated.'),
  ('Fentanyl', 'Analgesia', '2-5 mcg/kg IV slowly', 2::numeric, 10::numeric, 'mcg/kg/hr', 0.05::numeric, 'mg/ml', 'Dilute to suitable syringe driver concentration.', 'Sedation, respiratory rate, pain score.', 'Adjust to effect.'),
  ('Ketamine', 'Analgesia adjunct', '0.5 mg/kg IV slowly', 0.3::numeric, 1.2::numeric, 'mg/kg/hr', 100::numeric, 'mg/ml', 'Dilute to local protocol.', 'Heart rate, blood pressure, mentation.', 'Use as multimodal analgesia adjunct.')
) as seed(drug_name, indication, loading_dose, cri_rate_min, cri_rate_max, rate_unit, concentration, concentration_unit, dilution, monitoring, notes)
where not exists (
  select 1 from public.cri_protocols existing where existing.drug_name = seed.drug_name and coalesce(existing.indication, '') = coalesce(seed.indication, '')
);

insert into public.emergency_drug_calculator (drug_name, indication, dose_min, dose_max, dose_unit, route, concentration, concentration_unit, notes)
select * from (values
  ('Atropine', 'Bradycardia / CPR', 0.02::numeric, 0.04::numeric, 'mg/kg', 'IV/IM', 0.6::numeric, 'mg/ml', 'Use according to emergency protocol.'),
  ('Adrenaline', 'CPR', 0.01::numeric, 0.01::numeric, 'mg/kg', 'IV/IO', 1::numeric, 'mg/ml', 'Check product concentration carefully.'),
  ('Diazepam', 'Seizures', 0.5::numeric, 1::numeric, 'mg/kg', 'IV/PR', 5::numeric, 'mg/ml', 'Titrate to effect and monitor airway.')
) as seed(drug_name, indication, dose_min, dose_max, dose_unit, route, concentration, concentration_unit, notes)
where not exists (
  select 1 from public.emergency_drug_calculator existing where existing.drug_name = seed.drug_name and coalesce(existing.indication, '') = coalesce(seed.indication, '')
);

insert into public.fluid_calculators (calculation_name, formula, species, notes)
select * from (values
  ('Maintenance Dog', '50 x BW', 'Dog', 'Approximate daily maintenance volume in ml/day.'),
  ('Maintenance Cat', '40 x BW', 'Cat', 'Approximate daily maintenance volume in ml/day.'),
  ('Shock Dog', '90 x BW', 'Dog', 'Crystalloid shock dose in ml. Give aliquots and reassess.'),
  ('Shock Cat', '50 x BW', 'Cat', 'Crystalloid shock dose in ml. Give aliquots and reassess.')
) as seed(calculation_name, formula, species, notes)
where not exists (select 1 from public.fluid_calculators existing where existing.calculation_name = seed.calculation_name);

insert into public.transfusion_calculators (species, blood_volume_factor, notes)
select * from (values
  ('Dog', 90::numeric, 'Typical canine blood volume factor.'),
  ('Cat', 60::numeric, 'Typical feline blood volume factor.')
) as seed(species, blood_volume_factor, notes)
where not exists (select 1 from public.transfusion_calculators existing where existing.species = seed.species);

insert into public.species_toxicities (toxin, species, toxic_dose, clinical_signs, antidote, notes)
select * from (values
  ('Paracetamol', 'Cat', 'Any significant exposure', 'Methaemoglobinaemia, facial/paw oedema, depression, dyspnoea', 'Acetylcysteine', 'Urgent veterinary assessment required.'),
  ('Chocolate / theobromine', 'Dog', 'Dose dependent', 'Vomiting, tachycardia, agitation, tremors, seizures', 'Supportive care', 'Calculate theobromine dose where possible.'),
  ('Lily', 'Cat', 'Any exposure can be significant', 'Vomiting, lethargy, acute kidney injury', 'Supportive care / decontamination', 'Emergency assessment recommended.'),
  ('Ethylene glycol', 'Dog', 'Small exposures can be severe', 'Vomiting, ataxia, renal failure', 'Fomepizole / ethanol depending on protocol', 'Time critical emergency.')
) as seed(toxin, species, toxic_dose, clinical_signs, antidote, notes)
where not exists (select 1 from public.species_toxicities existing where existing.toxin = seed.toxin and existing.species = seed.species);
