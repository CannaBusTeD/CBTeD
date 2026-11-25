create or replace function public.cbted_repair_invalid_visual_prompt(p_run uuid, p_step text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_run public.production_runs%rowtype;
  v_step public.production_steps%rowtype;
  v_generation_key text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select r.* into v_run
  from public.production_runs r
  join public.projects p on p.id = r.project_id
  where r.id = p_run and p.owner_id = v_uid
  for update of r;

  if v_run.id is null or v_run.status not in ('active','blocked') then
    raise exception 'Active or blocked owned run required';
  end if;

  select * into v_step
  from public.production_steps
  where run_id = p_run and step_key = p_step
  for update;

  if v_step.id is null
     or v_step.status <> 'passed'
     or v_step.kind <> 'text'
     or v_step.agent <> 'visual_prompt_writer'
     or v_step.approval_required
     or p_step !~ '^visual_prompt_[1-9][0-9]*$' then
    raise exception 'Only a passed non-approval visual prompt stage may be repaired';
  end if;

  if length(btrim(coalesce(v_step.output_text,''))) >= 200
     and btrim(v_step.output_text) <> p_step then
    raise exception 'Visual prompt is not the known placeholder form';
  end if;

  v_generation_key := regexp_replace(p_step, '^visual_prompt_', 'visual_generate_');
  if not exists (
    select 1 from public.production_steps s
    where s.run_id = p_run
      and s.step_key = v_generation_key
      and s.kind = 'image'
      and s.status = 'pending'
      and s.attempt_number = 0
      and s.asset_id is null
  ) then
    raise exception 'Matching untouched image generation stage required';
  end if;

  if exists (
    select 1 from public.production_steps s
    where s.run_id = p_run
      and s.sequence_index > v_step.sequence_index
      and (s.status <> 'pending' or s.attempt_number <> 0 or s.asset_id is not null)
  ) then
    raise exception 'Downstream work has already started';
  end if;

  insert into public.production_step_attempts(run_id,project_id,step_key,attempt_number,status,output_text,evidence)
  values(v_step.run_id,v_step.project_id,v_step.step_key,v_step.attempt_number,v_step.status,v_step.output_text,
         v_step.evidence || jsonb_build_object('repair_reason','invalid_visual_prompt_placeholder'))
  on conflict(run_id,step_key,attempt_number) do nothing;

  update public.production_steps
  set status='pending', output_text=null, asset_id=null, evidence='{}'::jsonb,
      started_at=null, finished_at=null
  where id=v_step.id;

  update public.production_runs set status='active' where id=p_run;
  return true;
end
$function$;

revoke all on function public.cbted_repair_invalid_visual_prompt(uuid,text) from public, anon;
grant execute on function public.cbted_repair_invalid_visual_prompt(uuid,text) to authenticated;