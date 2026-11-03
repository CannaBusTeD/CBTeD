-- Already applied to CBTeD Supabase on 2026-11-03.
-- Recorded migration version: 20261103010500.
-- Keep as the checked-in record; DO NOT apply it a second time.

create table public.studio_settings (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 studio text not null check (studio in ('visual','animation')),
 version_number integer not null check (version_number > 0),
 settings jsonb not null check(jsonb_typeof(settings) = 'object'),
 source_version_id uuid,
 created_at timestamptz not null default now(),
 foreign key(project_id,source_version_id) references public.source_versions(project_id,id),
 unique(project_id,studio,version_number),
 unique(project_id,id)
);
create index studio_settings_project_idx on public.studio_settings(project_id,studio,version_number desc);
alter table public.studio_settings enable row level security;
revoke all on public.studio_settings from anon,public;
grant select,insert on public.studio_settings to authenticated;
create policy owner_select on public.studio_settings for select to authenticated using (
 exists(select 1 from public.projects p where p.id=studio_settings.project_id and p.owner_id=(select auth.uid()))
);
create policy owner_insert on public.studio_settings for insert to authenticated with check (
 exists(select 1 from public.projects p where p.id=studio_settings.project_id and p.owner_id=(select auth.uid()))
);

create table public.project_runs (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 request_id uuid not null,
 stage_selection jsonb not null check (jsonb_typeof(stage_selection)='object'),
 snapshot jsonb not null check (jsonb_typeof(snapshot)='object'),
 status text not null default 'prepared' check(status in ('prepared','blocked','running','completed','failed')),
 created_at timestamptz not null default now(),
 unique(project_id,request_id),
 unique(project_id,id)
);
create index project_runs_project_idx on public.project_runs(project_id,created_at desc);
alter table public.project_runs enable row level security;
revoke all on public.project_runs from anon,public;
grant select,insert on public.project_runs to authenticated;
create policy owner_select on public.project_runs for select to authenticated using (
 exists(select 1 from public.projects p where p.id=project_runs.project_id and p.owner_id=(select auth.uid()))
);
create policy owner_insert on public.project_runs for insert to authenticated with check (
 exists(select 1 from public.projects p where p.id=project_runs.project_id and p.owner_id=(select auth.uid()))
);

alter table public.tasks add column run_id uuid;
alter table public.tasks add constraint tasks_run_fk foreign key(project_id,run_id)
 references public.project_runs(project_id,id);
create index tasks_run_idx on public.tasks(run_id) where run_id is not null;
