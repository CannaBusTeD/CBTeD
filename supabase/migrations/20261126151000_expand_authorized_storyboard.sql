-- Reconcile the one-image bootstrap plan with the approved numbered storyboard.
-- Called after the first independent image review so the original scene binding
-- is known. Only pending, unattempted downstream stages may move.
create or replace function public.cbted_expand_authorized_storyboard(p_run uuid)
returns integer language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  r public.production_runs%rowtype;
  review public.production_steps%rowtype;
  board text;
  prompt text;
  grant_body text;
  count_authorized integer;
  scene_numbers integer[];
  first_scene integer;
  remaining integer[];
  clip_count integer;
  old_plan jsonb;
  new_plan jsonb;
  slot jsonb;
  moved record;
  idx integer;
  suffix integer;
begin
  select * into strict r from public.production_runs where id=p_run for update;
  if r.workflow not in ('idea_to_publish_audio','idea_to_publish') or r.status <> 'active' then return 0; end if;
  select x->>'body' into grant_body from jsonb_array_elements(r.rules_snapshot) x
    where x->>'key'='automatic_zero_credit_continuation';
  if grant_body is null then return 0; end if;
  if grant_body ~* 'all six individual storyboard images' then count_authorized := 6;
  elsif grant_body ~ '^\s*\{' and pg_input_is_valid(grant_body,'jsonb') then
    if coalesce(grant_body::jsonb->>'image_count','') ~ '^[0-9]{1,2}$' then
      count_authorized := (grant_body::jsonb->>'image_count')::integer;
    end if;
  end if;
  if count_authorized is null or count_authorized not between 2 and 20 then return 0; end if;
  perform 1 from public.production_steps where run_id=p_run order by sequence_index for update;
  select * into review from public.production_steps where run_id=p_run and step_key='visual_review_1';
  if review.status is distinct from 'passed' or exists(select 1 from public.production_steps
      where run_id=p_run and (step_key='visual_prompt_2' or (sequence_index>review.sequence_index
      and (status<>'pending' or attempt_number<>0 or started_at is not null)))) then return 0; end if;
  select output_text into board from public.production_steps where run_id=p_run and step_key='story_storyboard' and status='passed';
  select output_text into prompt from public.production_steps where run_id=p_run and step_key='visual_prompt_1' and status='passed';
  select array_agg((m[1])::integer order by ord) into scene_numbers from
    regexp_matches(board,'^[[:blank:]]*[0-9]+\.[[:blank:]]+Scene[[:blank:]]+([0-9]{1,2})[[:blank:]]+[—–-]','gin') with ordinality as v(m,ord);
  if scene_numbers is distinct from array(select generate_series(1,count_authorized)) then return 0; end if;
  select case when count(distinct m[1])=1 then min(m[1])::integer end into first_scene
    from regexp_matches(prompt,'storyboard[[:blank:]]+moment[[:blank:]]+#([0-9]{1,2})','gi') m;
  if first_scene is null or first_scene<>all(scene_numbers) then return 0; end if;
  remaining := array_remove(scene_numbers,first_scene);
  select count(*) into clip_count from public.production_steps where run_id=p_run and step_key ~ '^animation_generate_[0-9]+$';
  old_plan := public.cbted_canonical_plan(r.workflow,1,clip_count);
  new_plan := public.cbted_canonical_plan(r.workflow,count_authorized,clip_count);
  -- Never reinterpret a custom or concurrently changed downstream plan.
  if jsonb_array_length(old_plan)<>(select count(*) from public.production_steps where run_id=p_run)
     or exists(select 1 from jsonb_array_elements(old_plan) with ordinality t(item,n)
       left join public.production_steps s on s.run_id=p_run and s.step_key=t.item->>'key'
       where s.id is null or s.sequence_index<>t.n or (t.n>review.sequence_index and
         (s.depends_on<>array(select jsonb_array_elements_text(t.item->'depends_on'))
          or s.approval_required<>(t.item->>'approval_required')::boolean))) then return 0; end if;
  -- Descending updates preserve the existing immediate unique sequence constraint.
  for moved in select id from public.production_steps where run_id=p_run and sequence_index>review.sequence_index
               order by sequence_index desc loop
    update public.production_steps set sequence_index=sequence_index+3*(count_authorized-1) where id=moved.id;
  end loop;
  for slot,idx in select item,n from jsonb_array_elements(new_plan) with ordinality t(item,n) where n>review.sequence_index loop
    if slot->>'key' ~ '^visual_(prompt|generate|review)_[0-9]+$' then
      suffix := substring(slot->>'key' from '([0-9]+)$')::integer;
      insert into public.production_steps(run_id,project_id,step_key,sequence_index,agent,studio,kind,depends_on,approval_required,evidence)
        values(p_run,r.project_id,slot->>'key',idx,slot->>'agent',slot->>'studio',slot->>'kind',
          array(select jsonb_array_elements_text(slot->'depends_on')),(slot->>'approval_required')::boolean,
          jsonb_build_object('storyboard_scene_number',remaining[suffix-1]));
    else
      update public.production_steps set depends_on=array(select jsonb_array_elements_text(slot->'depends_on'))
        where run_id=p_run and step_key=slot->>'key' and depends_on is distinct from array(select jsonb_array_elements_text(slot->'depends_on'));
    end if;
  end loop;
  return count_authorized-1;
end $$;
revoke all on function public.cbted_expand_authorized_storyboard(uuid) from public, anon, authenticated;
grant execute on function public.cbted_expand_authorized_storyboard(uuid) to service_role;

create or replace function public.cbted_expand_after_first_image_review()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  perform public.cbted_expand_authorized_storyboard(new.run_id);
  return new;
end $$;
revoke all on function public.cbted_expand_after_first_image_review() from public, anon, authenticated;
drop trigger if exists cbted_expand_after_first_image_review on public.production_steps;
create trigger cbted_expand_after_first_image_review after update of status on public.production_steps
  for each row when (new.step_key='visual_review_1' and new.status='passed' and old.status is distinct from new.status)
  execute function public.cbted_expand_after_first_image_review();
