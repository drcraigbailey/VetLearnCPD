-- VetLearn Clinical Tools tables and starter data
-- Paste this into Supabase SQL Editor and run once.

create table if not exists public.drug_calculators (
    id bigserial primary key,
    drug_name text not null,
    species text not null,
    min_dose numeric,
    max_dose numeric,
    dose_unit text default 'mg/kg',
    route text,
    concentration numeric,
    concentration_unit text,
    notes text,
    created_at timestamptz default now()
);

create table if not exists public.cri_protocols (
    id bigserial primary key,
    drug_name text not null,
    indication text,
    loading_dose text,
    cri_rate_min numeric,
    cri_rate_max numeric,
    rate_unit text,
    concentration numeric,
    concentration_unit text,
    dilution text,
    monitoring text,
    notes text,
    created_at timestamptz default now()
);

create table if not exists public.emergency_drug_calculator (
    id bigserial primary key,
    drug_name text not null,
    indication text,
    dose_min numeric,
    dose_max numeric,
    dose_unit text,
    route text,
    concentration numeric,
    concentration_unit text,
    notes text,
    created_at timestamptz default now()
);

create table if not exists public.fluid_calculators (
    id bigserial primary key,
    calculation_name text not null,
    formula text,
    species text,
    notes text,
    created_at timestamptz default now()
);

create table if not exists public.transfusion_calculators (
    id bigserial primary key,
    species text,
    blood_volume_factor numeric,
    notes text,
    created_at timestamptz default now()
);

create table if not exists public.species_toxicities (
    id bigserial primary key,
    toxin text not null,
    species text not null,
    toxic_dose text,
    clinical_signs text,
    antidote text,
    notes text,
    created_at timestamptz default now()
);

create table if not exists public.calculator_logs (
    id bigserial primary key,
    user_id uuid references auth.users(id) on delete cascade,
    calculator_type text,
    drug_name text,
    patient_weight numeric,
    result text,
    created_at timestamptz default now()
);

alter table public.drug_calculators enable row level security;
alter table public.cri_protocols enable row level security;
alter table public.emergency_drug_calculator enable row level security;
alter table public.fluid_calculators enable row level security;
alter table public.transfusion_calculators enable row level security;
alter table public.species_toxicities enable row level security;
alter table public.calculator_logs enable row level security;

-- Reference calculator data is readable by any signed-in user.
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

-- Users can only write/read their own usage logs.
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
values
  ('Meloxicam', 'Dog', 0.1, 0.2, 'mg/kg', 'PO', 1.5, 'mg/ml', 'Use current formulary guidance for duration and patient risk factors.'),
  ('Meloxicam', 'Cat', 0.05, 0.05, 'mg/kg', 'PO', 0.5, 'mg/ml', 'Use with caution and current local guidance.'),
  ('Methadone', 'Dog', 0.2, 0.4, 'mg/kg', 'IV/IM', 10, 'mg/ml', 'Monitor sedation and respiratory status.'),
  ('Buprenorphine', 'Cat', 0.01, 0.02, 'mg/kg', 'IV/IM/Buccal', 0.3, 'mg/ml', 'Dose route and formulation dependent.')
on conflict do nothing;

insert into public.cri_protocols (drug_name, indication, loading_dose, cri_rate_min, cri_rate_max, rate_unit, concentration, concentration_unit, dilution, monitoring, notes)
values
  ('Lidocaine', 'Analgesia / ventricular arrhythmia support', null, 25, 75, 'mcg/kg/min', 20, 'mg/ml', 'Dilute to local protocol.', 'ECG, blood pressure, mentation, adverse CNS signs.', 'Avoid or use extreme caution in cats unless specifically indicated.'),
  ('Fentanyl', 'Analgesia', '2-5 mcg/kg IV slowly', 2, 10, 'mcg/kg/hr', 0.05, 'mg/ml', 'Dilute to suitable syringe driver concentration.', 'Sedation, respiratory rate, pain score.', 'Adjust to effect.'),
  ('Ketamine', 'Analgesia adjunct', '0.5 mg/kg IV slowly', 0.3, 1.2, 'mg/kg/hr', 100, 'mg/ml', 'Dilute to local protocol.', 'Heart rate, blood pressure, mentation.', 'Use as multimodal analgesia adjunct.')
on conflict do nothing;

insert into public.emergency_drug_calculator (drug_name, indication, dose_min, dose_max, dose_unit, route, concentration, concentration_unit, notes)
values
  ('Atropine', 'Bradycardia / CPR', 0.02, 0.04, 'mg/kg', 'IV/IM', 0.6, 'mg/ml', 'Use according to emergency protocol.'),
  ('Adrenaline', 'CPR', 0.01, 0.01, 'mg/kg', 'IV/IO', 1, 'mg/ml', 'Check product concentration carefully.'),
  ('Diazepam', 'Seizures', 0.5, 1, 'mg/kg', 'IV/PR', 5, 'mg/ml', 'Titrate to effect and monitor airway.')
on conflict do nothing;

insert into public.fluid_calculators (calculation_name, formula, species, notes)
values
  ('Maintenance Dog', '50 x BW', 'Dog', 'Approximate daily maintenance volume in ml/day.'),
  ('Maintenance Cat', '40 x BW', 'Cat', 'Approximate daily maintenance volume in ml/day.'),
  ('Shock Dog', '90 x BW', 'Dog', 'Crystalloid shock dose in ml. Give aliquots and reassess.'),
  ('Shock Cat', '50 x BW', 'Cat', 'Crystalloid shock dose in ml. Give aliquots and reassess.')
on conflict do nothing;

insert into public.transfusion_calculators (species, blood_volume_factor, notes)
values
  ('Dog', 90, 'Typical canine blood volume factor.'),
  ('Cat', 60, 'Typical feline blood volume factor.')
on conflict do nothing;

insert into public.species_toxicities (toxin, species, toxic_dose, clinical_signs, antidote, notes)
values
  ('Paracetamol', 'Cat', 'Any significant exposure', 'Methaemoglobinaemia, facial/paw oedema, depression, dyspnoea', 'Acetylcysteine', 'Urgent veterinary assessment required.'),
  ('Chocolate / theobromine', 'Dog', 'Dose dependent', 'Vomiting, tachycardia, agitation, tremors, seizures', 'Supportive care', 'Calculate theobromine dose where possible.'),
  ('Lily', 'Cat', 'Any exposure can be significant', 'Vomiting, lethargy, acute kidney injury', 'Supportive care / decontamination', 'Emergency assessment recommended.'),
  ('Ethylene glycol', 'Dog', 'Small exposures can be severe', 'Vomiting, ataxia, renal failure', 'Fomepizole / ethanol depending on protocol', 'Time critical emergency.')
on conflict do nothing;
