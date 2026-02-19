create extension if not exists pgcrypto;

alter table public.legal_entities
  add column if not exists can_receive_sharer_cash boolean not null default false;

create table if not exists public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  legal_entity_id uuid null references public.legal_entities(id) on delete set null,
  doc_type text not null check (doc_type in ('producer_mandat', 'sharer_autofacturation')),
  status text not null default 'draft' check (status in ('draft', 'uploaded', 'pending_review', 'approved', 'rejected')),
  template_version text not null default 'v1',
  generated_pdf_path text null,
  signed_pdf_path text null,
  submitted_at timestamptz null,
  reviewed_at timestamptz null,
  reviewer_profile_id uuid null references public.profiles(id),
  rejection_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.legal_documents
  drop constraint if exists legal_documents_doc_type_check;

alter table public.legal_documents
  add constraint legal_documents_doc_type_check
  check (doc_type in ('producer_mandat', 'sharer_autofacturation'));

create unique index if not exists legal_documents_unique_active_idx
  on public.legal_documents (profile_id, doc_type, template_version)
  where status in ('draft', 'uploaded', 'pending_review', 'approved');

create index if not exists legal_documents_profile_status_idx
  on public.legal_documents (profile_id, status, doc_type);

create or replace function public.legal_documents_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
  end if;

  new.updated_at := now();

  if new.status in ('draft', 'uploaded', 'pending_review') then
    new.reviewed_at := null;
    new.reviewer_profile_id := null;
  end if;

  if new.status = 'pending_review' and new.submitted_at is null then
    new.submitted_at := now();
  end if;

  if new.status in ('approved', 'rejected') then
    new.reviewed_at := coalesce(new.reviewed_at, now());
    if new.reviewer_profile_id is null then
      new.reviewer_profile_id := auth.uid();
    end if;
  end if;

  if new.status = 'rejected' and coalesce(btrim(new.rejection_reason), '') = '' then
    raise exception 'rejection_reason is required when status is rejected';
  end if;

  if new.status <> 'rejected' then
    new.rejection_reason := null;
  end if;

  return new;
end;
$$;

create or replace function public.legal_documents_after_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  if new.status = 'approved' then
    if new.doc_type = 'sharer_autofacturation' then
      update public.legal_entities
      set can_receive_sharer_cash = true
      where profile_id = new.profile_id;
    elsif new.doc_type = 'producer_mandat' then
      update public.profiles
      set role = 'producer',
          verified = true
      where id = new.profile_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_legal_documents_before_write on public.legal_documents;
create trigger trg_legal_documents_before_write
before insert or update on public.legal_documents
for each row
execute function public.legal_documents_before_write();

drop trigger if exists trg_legal_documents_after_write on public.legal_documents;
create trigger trg_legal_documents_after_write
after insert or update on public.legal_documents
for each row
execute function public.legal_documents_after_write();

alter table public.legal_documents enable row level security;

grant select, insert, update, delete on public.legal_documents to authenticated;

drop policy if exists legal_documents_select_owner on public.legal_documents;
create policy legal_documents_select_owner
  on public.legal_documents
  for select
  using (
    auth.uid() = profile_id
    or auth.role() = 'service_role'
  );

drop policy if exists legal_documents_insert_owner on public.legal_documents;
create policy legal_documents_insert_owner
  on public.legal_documents
  for insert
  with check (
    auth.uid() = profile_id
    and status in ('draft', 'uploaded', 'pending_review')
    and reviewed_at is null
    and reviewer_profile_id is null
  );

drop policy if exists legal_documents_update_owner on public.legal_documents;
create policy legal_documents_update_owner
  on public.legal_documents
  for update
  using (
    auth.uid() = profile_id
    and status in ('draft', 'uploaded', 'pending_review', 'rejected')
  )
  with check (
    auth.uid() = profile_id
    and status in ('draft', 'uploaded', 'pending_review')
    and reviewed_at is null
    and reviewer_profile_id is null
  );

drop policy if exists legal_documents_delete_owner on public.legal_documents;
create policy legal_documents_delete_owner
  on public.legal_documents
  for delete
  using (auth.uid() = profile_id);

create or replace view public.pending_documents_view
with (security_invoker = true)
as
select
  d.profile_id,
  p.handle,
  le.legal_name,
  d.doc_type,
  d.submitted_at,
  d.signed_pdf_path,
  d.status
from public.legal_documents d
left join public.profiles p on p.id = d.profile_id
left join public.legal_entities le on le.id = d.legal_entity_id
where d.status in ('uploaded', 'pending_review')
order by d.submitted_at desc nulls last;

grant select on public.pending_documents_view to authenticated;

create or replace function public.approve_document(p_doc_id uuid)
returns public.legal_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.legal_documents;
begin
  update public.legal_documents
  set status = 'approved',
      rejection_reason = null
  where id = p_doc_id
  returning * into v_doc;

  if not found then
    raise exception 'Document not found: %', p_doc_id;
  end if;

  return v_doc;
end;
$$;

create or replace function public.reject_document(p_doc_id uuid, p_reason text)
returns public.legal_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.legal_documents;
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'rejection reason is required';
  end if;

  update public.legal_documents
  set status = 'rejected',
      rejection_reason = btrim(p_reason)
  where id = p_doc_id
  returning * into v_doc;

  if not found then
    raise exception 'Document not found: %', p_doc_id;
  end if;

  return v_doc;
end;
$$;

revoke all on function public.approve_document(uuid) from public, anon, authenticated;
revoke all on function public.reject_document(uuid, text) from public, anon, authenticated;
grant execute on function public.approve_document(uuid) to service_role;
grant execute on function public.reject_document(uuid, text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'signed_documents',
  'signed_documents',
  false,
  10485760,
  array['application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'generated_legal_documents',
  'generated_legal_documents',
  false,
  10485760,
  array['application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists signed_documents_select_owner on storage.objects;
create policy signed_documents_select_owner
  on storage.objects
  for select
  using (
    bucket_id = 'signed_documents'
    and (
      (
        (storage.foldername(name))[1] = 'producers'
        and (storage.foldername(name))[2] = auth.uid()::text
        and (storage.foldername(name))[3] = 'mandat'
      )
      or (
        (storage.foldername(name))[1] = 'sharers'
        and (storage.foldername(name))[2] = auth.uid()::text
        and (storage.foldername(name))[3] = 'autofacturation'
      )
      or auth.role() = 'service_role'
    )
  );

drop policy if exists signed_documents_insert_owner on storage.objects;
create policy signed_documents_insert_owner
  on storage.objects
  for insert
  with check (
    bucket_id = 'signed_documents'
    and name ~* '\.pdf$'
    and (
      (
        (storage.foldername(name))[1] = 'producers'
        and (storage.foldername(name))[2] = auth.uid()::text
        and (storage.foldername(name))[3] = 'mandat'
      )
      or (
        (storage.foldername(name))[1] = 'sharers'
        and (storage.foldername(name))[2] = auth.uid()::text
        and (storage.foldername(name))[3] = 'autofacturation'
      )
      or auth.role() = 'service_role'
    )
  );

drop policy if exists signed_documents_update_owner on storage.objects;
create policy signed_documents_update_owner
  on storage.objects
  for update
  using (
    bucket_id = 'signed_documents'
    and (
      (
        (storage.foldername(name))[1] = 'producers'
        and (storage.foldername(name))[2] = auth.uid()::text
        and (storage.foldername(name))[3] = 'mandat'
      )
      or (
        (storage.foldername(name))[1] = 'sharers'
        and (storage.foldername(name))[2] = auth.uid()::text
        and (storage.foldername(name))[3] = 'autofacturation'
      )
      or auth.role() = 'service_role'
    )
  )
  with check (
    bucket_id = 'signed_documents'
    and name ~* '\.pdf$'
    and (
      (
        (storage.foldername(name))[1] = 'producers'
        and (storage.foldername(name))[2] = auth.uid()::text
        and (storage.foldername(name))[3] = 'mandat'
      )
      or (
        (storage.foldername(name))[1] = 'sharers'
        and (storage.foldername(name))[2] = auth.uid()::text
        and (storage.foldername(name))[3] = 'autofacturation'
      )
      or auth.role() = 'service_role'
    )
  );

drop policy if exists signed_documents_delete_owner on storage.objects;
create policy signed_documents_delete_owner
  on storage.objects
  for delete
  using (
    bucket_id = 'signed_documents'
    and (
      (
        (storage.foldername(name))[1] = 'producers'
        and (storage.foldername(name))[2] = auth.uid()::text
        and (storage.foldername(name))[3] = 'mandat'
      )
      or (
        (storage.foldername(name))[1] = 'sharers'
        and (storage.foldername(name))[2] = auth.uid()::text
        and (storage.foldername(name))[3] = 'autofacturation'
      )
      or auth.role() = 'service_role'
    )
  );
