-- VetLearn My Drugs sharing and collaboration.
-- Run after my_monographs_feature.sql and sql/network_posts.sql.
-- Safe to re-run.

create table if not exists public.drug_collaborators (
  id uuid primary key default gen_random_uuid(),
  drug_id bigint not null references public.drugs(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission text not null default 'read' check (permission in ('read', 'edit')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (drug_id, user_id),
  check (owner_id <> user_id)
);

create index if not exists drug_collaborators_user_id_idx
  on public.drug_collaborators(user_id);

create index if not exists drug_collaborators_drug_id_idx
  on public.drug_collaborators(drug_id);

alter table public.drug_collaborators enable row level security;

alter table public.network_posts
  add column if not exists shared_payload jsonb,
  add column if not exists visibility text not null default 'network',
  add column if not exists post_category text not null default 'General',
  add column if not exists attachment_urls text[] not null default '{}'::text[];

drop function if exists public.owns_custom_drug(uuid);
drop function if exists public.can_access_shared_drug(uuid, boolean);
drop function if exists public.join_shared_drug_collaboration(uuid, uuid);

create or replace function public.owns_custom_drug(selected_drug_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.drugs d
    where d.id = selected_drug_id
      and d.user_id = auth.uid()
  );
$$;

create or replace function public.can_access_shared_drug(
  selected_drug_id bigint,
  require_edit boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.drug_collaborators dc
    where dc.drug_id = selected_drug_id
      and dc.user_id = auth.uid()
      and (not require_edit or dc.permission = 'edit')
  );
$$;

grant execute on function public.owns_custom_drug(bigint) to authenticated;
grant execute on function public.can_access_shared_drug(bigint, boolean) to authenticated;

drop policy if exists "Drug collaborators can view their shares" on public.drug_collaborators;
create policy "Drug collaborators can view their shares"
  on public.drug_collaborators
  for select
  to authenticated
  using (owner_id = auth.uid() or user_id = auth.uid());

drop policy if exists "Drug owners can share with accepted colleagues" on public.drug_collaborators;
create policy "Drug owners can share with accepted colleagues"
  on public.drug_collaborators
  for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and public.owns_custom_drug(drug_id)
    and public.has_feature('my_drugs')
    and exists (
      select 1
      from public.connections c
      where c.status = 'accepted'
        and (
          (c.requester_id = auth.uid() and c.receiver_id = user_id)
          or (c.receiver_id = auth.uid() and c.requester_id = user_id)
        )
    )
  );

drop policy if exists "Drug owners can change collaborator access" on public.drug_collaborators;
create policy "Drug owners can change collaborator access"
  on public.drug_collaborators
  for update
  to authenticated
  using (owner_id = auth.uid() and public.owns_custom_drug(drug_id))
  with check (owner_id = auth.uid() and public.owns_custom_drug(drug_id));

drop policy if exists "Owners or recipients can remove drug shares" on public.drug_collaborators;
create policy "Owners or recipients can remove drug shares"
  on public.drug_collaborators
  for delete
  to authenticated
  using (owner_id = auth.uid() or user_id = auth.uid());

drop policy if exists "Authenticated users can read available drugs" on public.drugs;
create policy "Authenticated users can read available drugs"
  on public.drugs
  for select
  to authenticated
  using (
    user_id is null
    or (
      public.has_feature('my_drugs')
      and (
        user_id = auth.uid()
        or public.can_access_shared_drug(id, false)
      )
    )
  );

drop policy if exists "Users can update their own monographs" on public.drugs;
drop policy if exists "Owners and editors can update monographs" on public.drugs;
create policy "Owners and editors can update monographs"
  on public.drugs
  for update
  to authenticated
  using (
    public.has_feature('my_drugs')
    and (
      user_id = auth.uid()
      or public.can_access_shared_drug(id, true)
    )
  )
  with check (
    public.has_feature('my_drugs')
    and (
      user_id = auth.uid()
      or public.can_access_shared_drug(id, true)
    )
  );

drop policy if exists "My Drugs feature gate" on public.drugs;
create policy "My Drugs feature gate"
  on public.drugs
  as restrictive
  for all
  to authenticated
  using (
    user_id is null
    or (
      public.has_feature('my_drugs')
      and (
        user_id = auth.uid()
        or public.can_access_shared_drug(id, false)
      )
    )
  )
  with check (
    public.has_feature('my_drugs')
    and (
      user_id = auth.uid()
      or public.can_access_shared_drug(id, true)
    )
  );

create or replace function public.protect_shared_drug_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.user_id is distinct from new.user_id and old.user_id <> auth.uid() then
    raise exception 'Only the monograph owner can change ownership';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_shared_drug_owner on public.drugs;
create trigger protect_shared_drug_owner
before update on public.drugs
for each row
execute function public.protect_shared_drug_owner();

create or replace function public.join_shared_drug_collaboration(
  selected_drug_id bigint,
  selected_post_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  post_row public.network_posts%rowtype;
  drug_owner uuid;
begin
  if auth.uid() is null or not public.has_feature('my_drugs') then
    raise exception 'My Drugs is not available for this account';
  end if;

  select *
  into post_row
  from public.network_posts
  where id = selected_post_id
    and is_deleted = false
    and shared_type = 'drug'
    and coalesce((shared_payload ->> 'collaboration_enabled')::boolean, false) = true
    and shared_payload ->> 'id' = selected_drug_id::text;

  if post_row.id is null then
    raise exception 'This post is not accepting collaborators';
  end if;

  if post_row.visibility = 'colleagues' and not exists (
    select 1
    from public.connections c
    where c.status = 'accepted'
      and (
        (c.requester_id = post_row.author_id and c.receiver_id = auth.uid())
        or (c.receiver_id = post_row.author_id and c.requester_id = auth.uid())
      )
  ) then
    raise exception 'This collaboration is limited to the author''s colleagues';
  end if;

  select user_id into drug_owner
  from public.drugs
  where id = selected_drug_id
    and user_id = post_row.author_id;

  if drug_owner is null then
    raise exception 'The original monograph is no longer available';
  end if;

  if drug_owner = auth.uid() then
    return;
  end if;

  insert into public.drug_collaborators (drug_id, owner_id, user_id, permission)
  values (selected_drug_id, drug_owner, auth.uid(), 'edit')
  on conflict (drug_id, user_id) do update set
    permission = 'edit',
    updated_at = now();
end;
$$;

grant execute on function public.join_shared_drug_collaboration(bigint, uuid) to authenticated;

alter table public.network_posts
  drop constraint if exists network_posts_shared_type_check;

alter table public.network_posts
  add constraint network_posts_shared_type_check check (
    shared_type is null
    or shared_type in ('caselog', 'drug', 'protocol', 'cpd', 'resource')
  );
