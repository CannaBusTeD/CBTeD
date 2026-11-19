-- Complete a reviewed media job AND its production stage in one transaction.
-- The caller is the signed-in owner. This function never generates or spends credits.
create or replace function public.cbted_finish_media_generation(
 p_job uuid,p_decision text,p_note text
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
 v_uid uuid:=auth.uid();
 v_job public.cbted_media_jobs%rowtype;
 v_asset public.assets%rowtype;
 v_status text;
 v_result jsonb;
begin
 if v_uid is null then raise exception 'Sign in required'; end if;
 if p_decision not in ('passed','failed') or char_length(btrim(coalesce(p_note,''))) not between 15 and 2000
 then raise exception 'Specific real media review and verdict required'; end if;
 select * into v_job from public.cbted_media_jobs
  where id=p_job and owner_id=v_uid for update;
 if not found or v_job.status<>'needs_review' or v_job.result_asset_id is null
 then raise exception 'A submitted, imported media job awaiting review is required'; end if;
 select * into v_asset from public.assets where id=v_job.result_asset_id
  and project_id=v_job.project_id;
 if not found or left(v_asset.mime_type,length(v_job.kind)+1)<>v_job.kind||'/'
   or not exists(select 1 from storage.objects
      where bucket_id='cbted-project-assets' and name=v_asset.storage_path)
 then raise exception 'A real, owned, persisted output of the correct media type is required'; end if;
 if v_job.run_id is not null or v_job.step_key is not null then
   if v_job.run_id is null or v_job.step_key is null
   then raise exception 'Incomplete production stage link'; end if;
   v_result:=public.cbted_finish_production_step(
    v_job.run_id,v_job.step_key,p_decision,
    null,
    case when p_decision='passed' then v_asset.id else null end,
    jsonb_build_object(
     'media_job_id',v_job.id,'provider',v_job.provider,
     'provider_job_id',v_job.provider_job_id,
     'review_note',p_note,
     'persisted_asset_id',v_asset.id
    ));
 end if;
 v_status:=case when p_decision='passed' then 'completed' else 'failed' end;
 update public.cbted_media_jobs set status=v_status,updated_at=now(),
   failure_reason=case when p_decision='failed' then p_note else null end
 where id=v_job.id;
 insert into public.cbted_media_job_events(owner_id,job_id,event,details)
 values(v_uid,v_job.id,'review_'||p_decision,
  jsonb_build_object('review_note',p_note,'asset_id',v_asset.id,'production_result',v_result));
 return jsonb_build_object('job_id',v_job.id,'status',v_status,
  'asset_id',v_asset.id,'production_stage_result',v_result);
end; $function$;
revoke all on function public.cbted_finish_media_generation(uuid,text,text) from public,anon;
grant execute on function public.cbted_finish_media_generation(uuid,text,text) to authenticated;
