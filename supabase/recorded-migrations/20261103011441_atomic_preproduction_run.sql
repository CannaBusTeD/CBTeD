-- Already applied to CBTeD Supabase on 2026-11-03.
-- Recorded migration version: 20261103011441.
-- Preserve as exact operational record, not a script to run again.
-- SECURITY INVOKER preserves the caller's RLS and requires a real owner.

create function public.prepare_project_run(
  p_project_id uuid,
  p_request_id uuid,
  p_stage_selection jsonb,
  p_snapshot jsonb,
  p_task_specs jsonb
)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_run_id uuid;
  v_spec jsonb;
  v_studio text;
  v_units integer;
  v_expected integer;
  v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in before starting a project run';
  end if;
  if not exists(
    select 1 from public.projects p where p.id=p_project_id and p.owner_id=(select auth.uid())
  ) then
    raise exception 'Project not found or access denied';
  end if;
  if jsonb_typeof(p_stage_selection) <> 'object'
      or jsonb_typeof(p_snapshot) <> 'object'
      or jsonb_typeof(p_task_specs) <> 'array' then
    raise exception 'Invalid production run payload';
  end if;
  if octet_length(p_snapshot::text)>1000000 then
    raise exception 'Production brief exceeds the one megabyte limit';
  end if;
  v_count:=jsonb_array_length(p_task_specs);
  if v_count < 1 or v_count > 3 then
    raise exception 'Choose one to three studios';
  end if;
  select count(distinct task->>'studio') into v_expected
    from jsonb_array_elements(p_task_specs) as task;
  if v_expected <> v_count then
    raise exception 'Each studio must occur only once per production run';
  end if;
  for v_spec in select value from jsonb_array_elements(p_task_specs) loop
    v_studio := v_spec->>'studio';
    if v_studio not in ('writing','visual','animation') then
      raise exception 'Unrecognised studio';
    end if;
    if p_stage_selection->>v_studio is distinct from 'true' then
      raise exception 'Selected studios and task stages do not agree';
    end if;
    begin
      v_units := (v_spec->>'requested_units')::integer;
    exception when invalid_text_representation then
      raise exception 'Invalid requested unit count';
    end;
    if v_units < 1 or v_units > 50 then
      raise exception 'Each studio must request between 1 and 50 separate outputs';
    end if;
  end loop;
  insert into public.project_runs(project_id,request_id,stage_selection,snapshot,status)
    values(p_project_id,p_request_id,p_stage_selection,p_snapshot,'prepared')
    on conflict(project_id,request_id) do nothing
    returning id into v_run_id;
  if v_run_id is null then
    select id into v_run_id from public.project_runs
      where project_id=p_project_id and request_id=p_request_id;
    return v_run_id;
  end if;
  for v_spec in select value from jsonb_array_elements(p_task_specs) loop
    v_studio := v_spec->>'studio';
    v_units := (v_spec->>'requested_units')::integer;
    insert into public.tasks(
      project_id,run_id,studio,operation,status,current_step,
      requested_units,completed_units,source_version_id,start_asset_id,requirements
    ) values (
      p_project_id,v_run_id,v_studio,v_spec->>'operation',
      'blocked','Awaiting connected and authorised creative execution provider',
      v_units,0,
      nullif(v_spec->>'source_version_id','')::uuid,
      nullif(v_spec->>'start_asset_id','')::uuid,
      jsonb_build_object(
        'source','saved_project_run','run_id',v_run_id,
        'studio_setup_version',v_spec->'studio_setup_version',
        'provider_connected',false
      )
    );
  end loop;
  return v_run_id;
end;
$$;
revoke all on function public.prepare_project_run(uuid,uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.prepare_project_run(uuid,uuid,jsonb,jsonb,jsonb) to authenticated;
