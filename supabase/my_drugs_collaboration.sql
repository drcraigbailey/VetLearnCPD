-- My Drugs collaboration support
-- Run this in Supabase SQL editor before enabling collaborator editing.
-- It keeps collaboration separate from read-only shared_records, so read-only shares do not accidentally grant edit access.

create table if not exists public.drug_collaborators (
  id uuid primary key default gen_random_uuid(),
  drug_id bigint not null references public.drugs(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  collaborator_id uuid not null references public.profiles(id) on delete cascade,
  permission text not null default 'editor' check (permission in ('viewer', 'commenter', 'editor')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (drug_id, collaborator_id)
);

alter table public.drug_collaborators enable row level security;

-- Owners can see invitations for their own My Drugs.
drop policy if exists "Drug owners can view collaborators" on public.drug_collaborators;
create policy "Drug owners can view collaborators"
on public.drug_collaborators
for select
to authenticated
using (owner_id = auth.uid());

-- Invited colleagues can see their own invitations.
drop policy if exists "Drug collaborators can view invitations" on public.drug_collaborators;
create policy "Drug collaborators can view invitations"
on public.drug_collaborators
for select
to authenticated
using (collaborator_id = auth.uid());

-- Only the owner of a user-created drug can invite collaborators.
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

-- Owners can update/revoke, and invited users can accept/decline their own invite.
drop policy if exists "Drug collaboration participants can update" on public.drug_collaborators;
create policy "Drug collaboration participants can update"
on public.drug_collaborators
for update
to authenticated
using (owner_id = auth.uid() or collaborator_id = auth.uid())
with check (owner_id = auth.uid() or collaborator_id = auth.uid());

-- Owners can remove collaborators.
drop policy if exists "Drug owners can remove collaborators" on public.drug_collaborators;
create policy "Drug owners can remove collaborators"
on public.drug_collaborators
for delete
to authenticated
using (owner_id = auth.uid());

-- Optional: allow accepted editor collaborators to view and update the shared My Drug row.
-- This does not affect main formulary/system drugs because it requires d.user_id is not null.
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
