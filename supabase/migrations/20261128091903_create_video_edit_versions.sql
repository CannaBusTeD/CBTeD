-- Canonical CBTeD project database. Video Editor drafts are append-only.
create table public.video_edit_versions (
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null check (version > 0),
  id uuid not null unique,
  plan jsonb not null check (
    jsonb_typeof(plan) = 'object'
    and plan @> '{"schema":"cbted-video-edit-v1"}'::jsonb
    and octet_length(plan::text) <= 150000
  ),
  created_at timestamptz not null default now(),
  previous_version integer generated always as (nullif(version - 1, 0)) stored,
  primary key (project_id, version),
  foreign key (project_id, previous_version) references public.video_edit_versions(project_id, version)
);

alter table public.video_edit_versions enable row level security;
revoke all on public.video_edit_versions from public, anon, authenticated;
grant select on public.video_edit_versions to authenticated;
grant insert (project_id, version, id, plan) on public.video_edit_versions to authenticated;

create policy video_edit_owner_read on public.video_edit_versions for select to authenticated
using (exists (
  select 1 from public.projects p
  where p.id = video_edit_versions.project_id and p.owner_id = (select auth.uid())
));

create policy video_edit_owner_append on public.video_edit_versions for insert to authenticated
with check (exists (
  select 1 from public.projects p
  where p.id = video_edit_versions.project_id and p.owner_id = (select auth.uid())
));
