-- Supabase migration 20261121212243, already applied to canonical project dmzzyfiwtosxtyekpbfi.
-- Append-only editorial override requests. Never overwrite existing approved work or auto-mark a step complete.
create table public.cbted_editorial_overrides (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  project_id uuid not null references public.projects(id) on delete cascade,
  run_id uuid references public.production_runs(id) on delete set null,
  step_key text,
  kind text not null check (kind in ('idea','writing','suno','song','storyboard','image','animation','video','assembly','publishing','other')),
  source_version_id uuid references public.source_versions(id) on delete set null,
  instructions text not null check (char_length(btrim(instructions)) between 1 and 4000),
  replacement_text text check (replacement_text is null or char_length(replacement_text) <= 100000),
  status text not null default 'requested' check (status in ('requested','cancelled','applied')),
  request_key uuid not null,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, request_key),
  check (step_key is null or (char_length(step_key) between 3 and 120 and step_key ~ '^[a-z][a-z0-9_]*$'))
);
create index cbted_editorial_overrides_project_status_idx
  on public.cbted_editorial_overrides(project_id, status, requested_at desc);
alter table public.cbted_editorial_overrides enable row level security;
revoke all on public.cbted_editorial_overrides from public, anon, authenticated;
grant select on public.cbted_editorial_overrides to authenticated;
grant all on public.cbted_editorial_overrides to service_role;
create policy cbted_editorial_read_owned on public.cbted_editorial_overrides
 for select to authenticated
 using (owner_id = (select auth.uid()) and
   exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));

create function public.cbted_request_editorial_override(
 p_project uuid,
 p_kind text,
 p_instructions text,
 p_run uuid default null,
 p_step text default null,
 p_source_version uuid default null,
 p_replacement_text text default null,
 p_request_key uuid default gen_random_uuid()
) returns uuid
language plpgsql security definer set search_path=''
as $function$
declare
 v_uid uuid := auth.uid();
 v_id uuid;
 v_previous public.cbted_editorial_overrides%rowtype;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if p_project is null or not exists(
   select 1 from public.projects p where p.id=p_project and p.owner_id=v_uid
 ) then raise exception 'Project access denied'; end if;
 if p_kind not in ('idea','writing','suno','song','storyboard','image','animation','video','assembly','publishing','other') then
   raise exception 'Unknown editorial stage'; end if;
 if p_instructions is null or char_length(btrim(p_instructions)) not between 1 and 4000 then
   raise exception 'Editorial instructions must be 1 to 4000 characters'; end if;
 if p_replacement_text is not null and char_length(p_replacement_text)>100000 then
   raise exception 'Replacement too long'; end if;
 if p_request_key is null then raise exception 'Request key required'; end if;
 if p_run is not null and not exists(
   select 1 from public.production_runs r where r.id=p_run and r.project_id=p_project
 ) then raise exception 'Run does not belong to the project'; end if;
 if p_step is not null and (
   p_run is null or p_step !~ '^[a-z][a-z0-9_]{2,119}$'
   or not exists(
      select 1 from public.production_steps s where s.run_id=p_run
        and s.project_id=p_project and s.step_key=p_step
   )
 ) then raise exception 'Target step not found in project run'; end if;
 if p_source_version is not null and not exists(
   select 1 from public.source_versions v where v.id=p_source_version and v.project_id=p_project
 ) then raise exception 'Source does not belong to the project'; end if;

 select * into v_previous from public.cbted_editorial_overrides
   where owner_id=v_uid and request_key=p_request_key;
 if v_previous.id is not null then
   if v_previous.project_id is distinct from p_project
      or v_previous.kind is distinct from p_kind
      or v_previous.instructions is distinct from p_instructions
      or v_previous.run_id is distinct from p_run
      or v_previous.step_key is distinct from p_step
      or v_previous.source_version_id is distinct from p_source_version
      or v_previous.replacement_text is distinct from p_replacement_text
   then raise exception 'Idempotency key already used for a different edit'; end if;
   return v_previous.id;
 end if;

 insert into public.cbted_editorial_overrides(
   owner_id,project_id,run_id,step_key,kind,source_version_id,
   instructions,replacement_text,request_key
 ) values (
   v_uid,p_project,p_run,p_step,p_kind,p_source_version,
   p_instructions,p_replacement_text,p_request_key
 ) returning id into v_id;
 return v_id;
end
$function$;

create function public.cbted_cancel_editorial_override(p_override uuid)
returns boolean language plpgsql security definer set search_path=''
as $function$
declare
 v_uid uuid := auth.uid();
 v_changed integer;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 update public.cbted_editorial_overrides o
   set status='cancelled', updated_at=now()
   where o.id=p_override and o.owner_id=v_uid and o.status='requested'
     and exists(select 1 from public.projects p where p.id=o.project_id and p.owner_id=v_uid);
 get diagnostics v_changed = row_count;
 return v_changed=1;
end
$function$;
revoke all on function public.cbted_request_editorial_override(uuid,text,text,uuid,text,uuid,text,uuid) from public,anon;
revoke all on function public.cbted_cancel_editorial_override(uuid) from public,anon;
grant execute on function public.cbted_request_editorial_override(uuid,text,text,uuid,text,uuid,text,uuid) to authenticated;
grant execute on function public.cbted_cancel_editorial_override(uuid) to authenticated;
