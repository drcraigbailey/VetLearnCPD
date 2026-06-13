-- My Drugs collaboration support
-- Safe to run more than once.
-- This version also repairs a partially-created drug_collaborators table.
-- It keeps collaboration separate from read-only shared_records, so read-only shares do not accidentally grant edit access.

create table if not exists public.drug_collaborators (
  id uuid primary key default gen_random_uuid(),
  drug_id bigint,
  owner_id uuid,
  collaborator_id uuid,
  permission text not null default 'editor',
  status text not null default 'pending',
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Repair older/partial versions of the table where create table if not exists skipped missing columns.
alter table public.drug_collaborators add column if not exists id uuid default gen_random_uuid();
alter table public.drug_collaborators add column if not exists drug_id bigint;
alter table public.drug_collaborators add column if not exists owner_id uuid;
alter table public.drug_collaborators add column if not exists collaborator_id uuid;
alter table public.drug_collaborators add column if not exists permission text not null default 'editor';
alter table public.drug_collaborators add column if not exists status text not null default 'pending';
alter table public.drug_collaborators add column if not exists invited_at timestamptz not null default now();
alter table public.drug_collaborators add column if not exists accepted_at timestamptz;
alter table public.drug_collaborators add column if not exists updated_at timestamptz not null default now();

-- Add constraints only if they are missing. These DO blocks avoid duplicate constraint errors.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'drug_collaborators_permission_check'
      and conrelid = 'public.drug_collaborators'::regclass
  ) then
    alter table public.drug_collaborators
      add constraint drug_collaborators_permission_check
      check (permission in ('viewer', 'commenter', 'editor'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'drug_collaborators_status_check'
      and conrelid = 'public.drug_collaborators'::regclass
  ) then
    alter table public.drug_collaborators
      add constraint drug_collaborators_status_check
      check (status in ('pending', 'accepted', 'declined', 'revoked'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'drug_collaborators_drug_id_collaborator_id_key'
      and conrelid = 'public.drug_collaborators'::regclass
  ) then
    alter table public.drug_collaborators
      add constraint drug_collaborators_drug_id_collaborator_id_key
      unique (drug_id, collaborator_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'drug_collaborators_drug_id_fkey'
      and conrelid = 'public.drug_collaborators'::regclass
  ) then
    alter table public.drug_collaborators
      add constraint drug_collaborators_drug_id_fkey
      foreign key (drug_id) references public.drugs(id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'drug_collaborators_owner_id_fkey'
      and conrelid = 'public.drug_collaborators'::regclass
  ) then
    alter table public.drug_collaborators
      add constraint drug_collaborators_owner_id_fkey
      foreign key (owner_id) references public.profiles(id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'drug_collaborators_collaborator_id_fkey'
      and conrelid = 'public.drug_collaborators'::regclass
  ) then
    alter table public.drug_collaborators
      add constraint drug_collaborators_collaborator_id_fkey
      foreign key (collaborator_id) references public.profiles(id) on delete cascade;
  end if;
end $$;

create index if not exists idx_drug_collaborators_drug_id on public.drug_collaborators(drug_id);
create index if not exists idx_drug_collaborators_owner_id on public.drug_collaborators(owner_id);
create index if not exists idx_drug_collaborators_collaborator_id on public.drug_collaborators(collaborator_id);

alter table public.drug_collaborators enable row level security;

-- Recreate policies after the table has been repaired.
drop policy if exists "Drug owners can view collaborators" on public.drug_collaborators;
create policy "Drug owners can view collaborators"
on public.drug_collaborators
for select
to authenticated
using (owner_id = auth.uid());

drop policy if exists "Drug collaborators can view invitations" on public.drug_collaborators;
create policy "Drug collaborators can view invitations"
on public.drug_collaborators
for select
to authenticated
using (collaborator_id = auth.uid());

drop policy if exists "Drug owners can invite collaborators" on public.drug_collaborators;
create policy "Drug owners can invite collaborators"
on public.drug_collaborators
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and exists (
    select 1
    from public.drugs d
    where d.id = drug_collaborators.drug_id
      and d.user_id = auth.uid()
      and d.user_id is not null
  )
);

drop policy if exists "Drug collaboration participants can update" on public.drug_collaborators;
create policy "Drug collaboration participants can update"
on public.drug_collaborators
for update
to authenticated
using (owner_id = auth.uid() or collaborator_id = auth.uid())
with check (owner_id = auth.uid() or collaborator_id = auth.uid());

drop policy if exists "Drug owners can remove collaborators" on public.drug_collaborators;
create policy "Drug owners can remove collaborators"
on public.drug_collaborators
for delete
to authenticated
using (owner_id = auth.uid());

-- Optional: allow accepted editor collaborators to view and update the shared My Drug row.
-- This does not affect main formulary/system drugs because it requires drugs.user_id is not null.
drop policy if exists "Accepted collaborators can view My Drugs" on public.drugs;
create policy "Accepted collaborators can view My Drugs"
on public.drugs
for select
to authenticated
using (
  user_id is not null
  and exists (
    select 1
    from public.drug_collaborators dc
    where dc.drug_id = drugs.id
      and dc.collaborator_id = auth.uid()
      and dc.status = 'accepted'
  )
);

drop policy if exists "Accepted editor collaborators can update My Drugs" on public.drugs;
create policy "Accepted editor collaborators can update My Drugs"
on public.drugs
for update
to authenticated
using (
  user_id is not null
  and exists (
    select 1
    from public.drug_collaborators dc
    where dc.drug_id = drugs.id
      and dc.collaborator_id = auth.uid()
      and dc.status = 'accepted'
      and dc.permission = 'editor'
  )
)
with check (
  user_id is not null
  and exists (
    select 1
    from public.drug_collaborators dc
    where dc.drug_id = drugs.id
      and dc.collaborator_id = auth.uid()
      and dc.status = 'accepted'
      and dc.permission = 'editor'
  )
);
