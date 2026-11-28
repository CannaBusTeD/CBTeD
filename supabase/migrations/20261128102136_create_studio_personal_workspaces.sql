-- Canonical CBTeD database. Standalone tools use the signed-in owner's workspace.
create table public.studio_personal_edit_versions (
  owner_id uuid not null references auth.users(id) on delete cascade,
  version integer not null check (version > 0),
  id uuid not null unique,
  plan jsonb not null check (
    jsonb_typeof(plan) = 'object'
    and plan @> '{"schema":"cbted-video-edit-v1"}'::jsonb
    and octet_length(plan::text) <= 200000
  ),
  created_at timestamptz not null default now(),
  previous_version integer generated always as (nullif(version - 1, 0)) stored,
  primary key (owner_id, version),
  foreign key (owner_id, previous_version) references public.studio_personal_edit_versions(owner_id, version)
);

create table public.studio_personal_media (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  filename text not null check (char_length(btrim(filename)) between 1 and 255),
  mime_type text not null check (mime_type ~ '^(image|audio|video)/[a-z0-9.+-]+$'),
  duration_ms integer check (duration_ms > 0),
  bytes bigint not null check (bytes > 0),
  created_at timestamptz not null default now()
);

create index studio_personal_media_owner_created_idx on public.studio_personal_media(owner_id, created_at desc, id desc);

create table public.studio_personal_documents (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('ideas','writing','scenes','music','animation','reviews')),
  title text not null check (char_length(btrim(title)) between 1 and 140),
  body text not null check (octet_length(body) <= 400000),
  revision integer not null check (revision > 0),
  updated_at timestamptz not null default now()
);

create index studio_personal_documents_owner_kind_idx on public.studio_personal_documents(owner_id, kind, updated_at desc, id desc);

alter table public.studio_personal_edit_versions enable row level security;
alter table public.studio_personal_media enable row level security;
alter table public.studio_personal_documents enable row level security;

revoke all on public.studio_personal_edit_versions, public.studio_personal_media, public.studio_personal_documents from public, anon, authenticated;
grant select on public.studio_personal_edit_versions, public.studio_personal_media, public.studio_personal_documents to authenticated;
grant insert (owner_id, version, id, plan) on public.studio_personal_edit_versions to authenticated;
grant insert (owner_id, id, filename, mime_type, duration_ms, bytes) on public.studio_personal_media to authenticated;
grant insert (owner_id, id, kind, title, body, revision) on public.studio_personal_documents to authenticated;
grant update (title, body, revision, updated_at) on public.studio_personal_documents to authenticated;

create policy studio_personal_edit_read on public.studio_personal_edit_versions for select to authenticated using (owner_id = (select auth.uid()));
create policy studio_personal_edit_append on public.studio_personal_edit_versions for insert to authenticated with check (owner_id = (select auth.uid()));
create policy studio_personal_media_read on public.studio_personal_media for select to authenticated using (owner_id = (select auth.uid()));
create policy studio_personal_media_append on public.studio_personal_media for insert to authenticated with check (owner_id = (select auth.uid()));
create policy studio_personal_document_read on public.studio_personal_documents for select to authenticated using (owner_id = (select auth.uid()));
create policy studio_personal_document_add on public.studio_personal_documents for insert to authenticated with check (owner_id = (select auth.uid()));
create policy studio_personal_document_edit on public.studio_personal_documents for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

insert into storage.buckets(id, name, public) values ('cbted-studio-personal-media', 'cbted-studio-personal-media', false);

create policy studio_personal_file_read on storage.objects for select to authenticated
using (
  bucket_id = 'cbted-studio-personal-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy studio_personal_file_add on storage.objects for insert to authenticated
with check (
  bucket_id = 'cbted-studio-personal-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[2] = 'media'
  and storage.filename(name) ~ '^editor-[a-f0-9-]{36}$'
);
