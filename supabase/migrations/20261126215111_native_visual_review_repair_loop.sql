-- Reopen only a verified, owner-authorised native zero-credit scene. Preserve the rejected asset and its review.
CREATE OR REPLACE FUNCTION public.cbted_queue_native_visual_repair(p_run uuid,p_review text,p_automatic boolean)
RETURNS boolean LANGUAGE plpgsql SET search_path TO '' AS $repair$
DECLARE
 r public.production_runs%rowtype;
 v public.production_steps%rowtype;
 g public.production_steps%rowtype;
 q public.production_steps%rowtype;
 j public.cbted_media_jobs%rowtype;
 suffix text;
 ctx jsonb;
BEGIN
 SELECT pr.* INTO r FROM public.production_runs pr JOIN public.projects p ON p.id=pr.project_id
 WHERE pr.id=p_run AND p.owner_id=auth.uid() FOR UPDATE OF pr;
 IF r.id IS NULL OR r.status<>'blocked' OR r.rules_snapshot IS DISTINCT FROM public.cbted_locked_rules(r.project_id)
    OR p_review !~ '^visual_review_[1-9][0-9]*$' THEN RETURN false; END IF;
 IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r.rules_snapshot) x
   WHERE x->>'key'='automatic_zero_credit_continuation' AND x->>'scope'='project'
     AND x->>'body' LIKE '%Automatic mode should continue verified zero-credit production steps without individual owner approvals.%') THEN RETURN false; END IF;
 SELECT * INTO v FROM public.production_steps WHERE run_id=p_run AND step_key=p_review FOR UPDATE;
 IF v.id IS NULL OR v.status<>'failed' OR v.agent<>'image_reviewer'
    OR coalesce(v.output_text,'') !~* '^[[:space:]]*(VERDICT:[[:space:]]*)?REPAIR([[:space:]:.]|$)'
    OR coalesce(v.evidence#>>'{claimed_check,artifact_opened}','false')<>'true'
    OR (p_automatic AND v.attempt_number<>1) THEN RETURN false; END IF;
 suffix:=substring(p_review FROM '[0-9]+$');
 SELECT * INTO g FROM public.production_steps WHERE run_id=p_run AND step_key='visual_generate_'||suffix FOR UPDATE;
 SELECT * INTO q FROM public.production_steps WHERE run_id=p_run AND step_key='visual_prompt_'||suffix FOR UPDATE;
 IF g.id IS NULL OR q.id IS NULL OR g.status<>'passed' OR q.status<>'passed' OR g.kind<>'image' OR q.kind<>'text'
    OR NOT (g.step_key=ANY(v.depends_on)) OR NOT (q.step_key=ANY(g.depends_on)) OR g.asset_id IS NULL THEN RETURN false; END IF;
 IF (SELECT a.decision FROM public.production_approvals a WHERE a.run_id=p_run AND a.step_key=g.step_key
     ORDER BY a.created_at DESC,a.id DESC LIMIT 1) IS DISTINCT FROM 'approved' THEN RETURN false; END IF;
 SELECT * INTO j FROM public.cbted_media_jobs WHERE run_id=p_run AND project_id=r.project_id
   AND step_key=g.step_key AND result_asset_id=g.asset_id AND owner_id=auth.uid() AND status='completed'
   AND provider='chatgpt' AND kind='image' AND billing_mode='native' AND quote_credits=0
   AND approval_required=false AND import_digest ~ '^image/png:[a-f0-9]{64}$' FOR UPDATE;
 IF j.id IS NULL OR jsonb_typeof(j.settings#>'{quality,required_character_asset_ids}') IS DISTINCT FROM 'array'
    OR NOT EXISTS (SELECT 1 FROM public.assets a JOIN storage.objects o
    ON o.bucket_id='cbted-project-assets' AND o.name=a.storage_path
    WHERE a.id=g.asset_id AND a.project_id=r.project_id) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.production_steps s WHERE s.run_id=p_run AND s.sequence_index>v.sequence_index
     AND (s.status<>'pending' OR s.attempt_number<>0 OR s.asset_id IS NOT NULL)) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.cbted_media_jobs m WHERE m.run_id=p_run AND m.step_key=g.step_key AND m.id<>j.id
   AND m.status IN ('ready','approved','awaiting_quote','awaiting_approval','claimed','submitted','needs_review')) THEN RETURN false; END IF;
 ctx:=jsonb_build_object('kind','native_visual_repair','review_step',v.step_key,'review_attempt',v.attempt_number,
   'rejected_asset_id',g.asset_id,'previous_job_id',j.id,'previous_digest',j.import_digest,
   'review_findings',v.output_text,'previous_prompt',j.prompt,'provider','chatgpt','model',j.model,
   'aspect_ratio',j.settings->>'aspect_ratio','quote_credits',0,'automatic',p_automatic,
   'required_character_asset_ids',j.settings#>'{quality,required_character_asset_ids}',
   'instruction','Use the actual rejected private image as edit target; change the documented defect only, attach the locked real references, preserve composition, prepare one distinct zero-credit native job, then independently review its actual saved bytes.');
 INSERT INTO public.production_step_attempts(run_id,project_id,step_key,attempt_number,status,output_text,evidence)
 SELECT s.run_id,s.project_id,s.step_key,s.attempt_number,s.status,s.output_text,
        s.evidence||jsonb_build_object('archived_asset_id',s.asset_id,'repair_context',ctx)
 FROM public.production_steps s WHERE s.id IN(q.id,g.id,v.id)
 ON CONFLICT(run_id,step_key,attempt_number) DO NOTHING;
 UPDATE public.production_steps SET status='pending',output_text=NULL,asset_id=NULL,
   evidence=jsonb_build_object('repair_context',ctx),started_at=NULL,finished_at=NULL
 WHERE id IN(q.id,g.id,v.id);
 UPDATE public.production_runs SET status='active' WHERE id=p_run;
 RETURN true;
END $repair$;
REVOKE ALL ON FUNCTION public.cbted_queue_native_visual_repair(uuid,text,boolean) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.cbted_retry_production_step(p_run uuid, p_step text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_r public.production_runs%ROWTYPE; v_failed public.production_steps%ROWTYPE;
BEGIN
 SELECT r.* INTO v_r FROM public.production_runs r JOIN public.projects p ON p.id=r.project_id
 WHERE r.id=p_run AND p.owner_id=v_uid FOR UPDATE OF r;
 IF v_r.id IS NULL OR v_r.status<>'blocked' THEN
   RAISE EXCEPTION 'Blocked owned run required';
 END IF;
 SELECT * INTO v_failed FROM public.production_steps
 WHERE run_id=p_run AND step_key=p_step FOR UPDATE;
 IF v_failed.id IS NULL OR v_failed.status<>'failed' THEN
   RAISE EXCEPTION 'Only a failed stage may retry';
 END IF;

 IF p_step ~ '^visual_review_[1-9][0-9]*$'
   AND coalesce(v_failed.output_text,'') ~* '^[[:space:]]*(VERDICT:[[:space:]]*)?REPAIR([[:space:]:.]|$)' THEN
   IF NOT public.cbted_queue_native_visual_repair(p_run,p_step,false) THEN
     RAISE EXCEPTION 'Image repair requires inspected output, approved native zero-credit scope, and no downstream work; cannot retry the unchanged image';
   END IF;
   RETURN true;
 END IF;
 IF p_step='writing_review' AND (v_r.workflow='writing_rewrite' OR v_failed.output_text ~* '^VERDICT:\s*REPAIR') AND v_r.workflow IN ('writing_rewrite','writing','song_video','song_video_publish','idea_to_publish','idea_to_publish_audio') THEN
   -- One failed full-lyric review must reopen the WHOLE editorial chain.
   -- Preserve every previous creative stage before clearing its working outputs.
   INSERT INTO public.production_step_attempts(run_id,project_id,step_key,attempt_number,status,output_text,evidence)
   SELECT s.run_id,s.project_id,s.step_key,s.attempt_number,s.status,s.output_text,s.evidence
   FROM public.production_steps s WHERE s.run_id=p_run AND s.studio='writing' AND (v_r.workflow='writing_rewrite' OR s.step_key IN ('writing_rewrite','writing_proofread','writing_review'))
    AND s.status IN ('passed','failed')
   ON CONFLICT(run_id,step_key,attempt_number) DO NOTHING;
   UPDATE public.production_steps SET
     status='pending',output_text=NULL,asset_id=NULL,evidence='{}'::jsonb,
     started_at=NULL,finished_at=NULL
   WHERE run_id=p_run AND studio='writing' AND (v_r.workflow='writing_rewrite' OR step_key IN ('writing_rewrite','writing_proofread','writing_review'));
 ELSE
   INSERT INTO public.production_step_attempts(run_id,project_id,step_key,attempt_number,status,output_text,evidence)
   SELECT s.run_id,s.project_id,s.step_key,s.attempt_number,s.status,s.output_text,s.evidence
   FROM public.production_steps s WHERE s.id=v_failed.id
   ON CONFLICT(run_id,step_key,attempt_number) DO NOTHING;
   UPDATE public.production_steps SET status='pending',output_text=NULL,
       evidence='{}'::jsonb,started_at=NULL,finished_at=NULL
   WHERE id=v_failed.id;
 END IF;
 UPDATE public.production_runs SET status='active' WHERE id=p_run;
 RETURN true;
END $function$;
CREATE OR REPLACE FUNCTION public.cbted_finish_production_step(p_run uuid, p_step text, p_result text, p_text text DEFAULT NULL::text, p_asset uuid DEFAULT NULL::uuid, p_evidence jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid:=auth.uid();v_r public.production_runs%ROWTYPE;v_s public.production_steps%ROWTYPE;v_left int;
BEGIN
 SELECT r.* INTO v_r FROM public.production_runs r JOIN public.projects p ON p.id=r.project_id
 WHERE r.id=p_run AND p.owner_id=v_uid FOR UPDATE OF r;
 IF v_r.id IS NULL THEN RAISE EXCEPTION 'Run access denied';END IF;
 SELECT * INTO v_s FROM public.production_steps WHERE run_id=p_run AND step_key=p_step FOR UPDATE;
 IF v_s.id IS NULL OR v_s.status<>'in_progress' THEN RAISE EXCEPTION 'No active claim to finish';END IF;
 IF p_result NOT IN ('passed','failed') THEN RAISE EXCEPTION 'Invalid result';END IF;
 -- Fail closed: no caller can mark a post as published until the publishing service exists
 -- and replaces this check with verification of a real provider result.
 IF p_result='passed' AND v_s.kind='publish'
   THEN RAISE EXCEPTION 'Publishing is not connected yet; only the publishing service can confirm a post';END IF;
 IF p_result='passed' AND v_s.kind='text' AND (p_text IS NULL OR btrim(p_text)='')
   THEN RAISE EXCEPTION 'A completed text operation needs actual output';END IF;
 IF p_result='passed' AND v_s.kind IN ('image','video','audio') AND NOT EXISTS(
    SELECT 1 FROM public.assets a
    JOIN public.projects p ON p.id=a.project_id
    JOIN storage.objects o ON o.bucket_id='cbted-project-assets' AND o.name=a.storage_path
    WHERE a.id=p_asset AND a.project_id=v_r.project_id
      AND left(a.storage_path,length(p.owner_id::text||'/'||a.project_id::text||'/'))=p.owner_id::text||'/'||a.project_id::text||'/'
   ) THEN RAISE EXCEPTION 'Media requires an owned persisted asset';END IF;
 UPDATE public.production_steps SET status=p_result,output_text=CASE WHEN v_s.kind='text' THEN left(p_text,250000) ELSE NULL END,
    asset_id=CASE WHEN v_s.kind<>'text' THEN p_asset ELSE NULL END,
    evidence=coalesce(p_evidence,'{}'::jsonb),finished_at=now() WHERE id=v_s.id;
 IF p_result='failed' THEN
   UPDATE public.production_runs SET status='blocked' WHERE id=p_run;
   IF public.cbted_queue_native_visual_repair(p_run,p_step,true) THEN
     RETURN jsonb_build_object('step',p_step,'status','failed','run_completed',false,
       'repair_queued',true,'run_status','active','next_step',regexp_replace(p_step,'^visual_review_','visual_prompt_'));
   END IF;
 ELSE
   SELECT count(*) INTO v_left FROM public.production_steps WHERE run_id=p_run AND status<>'passed';
   IF v_left=0 THEN UPDATE public.production_runs SET status='completed' WHERE id=p_run;END IF;
 END IF;
 RETURN jsonb_build_object('step',p_step,'status',p_result,'run_completed',p_result='passed' AND v_left=0);
END $function$;
CREATE OR REPLACE FUNCTION public.cbted_claim_production_step(p_run uuid, p_step text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid:=auth.uid();v_r public.production_runs%ROWTYPE;v_s public.production_steps%ROWTYPE;v_remaining int;v_decision text;
BEGIN
 SELECT r.* INTO v_r FROM public.production_runs r JOIN public.projects p ON p.id=r.project_id
 WHERE r.id=p_run AND p.owner_id=v_uid FOR UPDATE OF r;
 IF v_r.id IS NULL THEN RAISE EXCEPTION 'Run access denied';END IF;
 IF v_r.status NOT IN ('prepared','active') THEN RAISE EXCEPTION 'Run is not active';END IF;
 IF v_r.rules_snapshot IS DISTINCT FROM public.cbted_locked_rules(v_r.project_id)
   THEN RAISE EXCEPTION 'Locked rules changed; replan before executing';END IF;
 SELECT * INTO v_s FROM public.production_steps WHERE run_id=p_run AND step_key=p_step FOR UPDATE;
 IF v_s.id IS NULL OR v_s.status <> 'pending' THEN RAISE EXCEPTION 'Step is not pending';END IF;
 SELECT count(*) INTO v_remaining FROM unnest(v_s.depends_on) AS d(key)
 LEFT JOIN public.production_steps done ON done.run_id=p_run AND done.step_key=d.key AND done.status='passed'
 WHERE done.id IS NULL;
 IF v_remaining>0 THEN RAISE EXCEPTION 'Previous required stage has not passed';END IF;
 IF v_s.kind='image' AND v_s.evidence ? 'repair_context' THEN
   IF NOT EXISTS(SELECT 1 FROM public.cbted_media_jobs j
      WHERE j.run_id=p_run AND j.project_id=v_r.project_id AND j.owner_id=v_uid AND j.step_key=p_step
      AND j.status='ready' AND j.provider='chatgpt' AND j.kind='image' AND j.billing_mode='native'
      AND j.quote_credits=0 AND j.approval_required=false AND j.source_asset_id::text=v_s.evidence#>>'{repair_context,rejected_asset_id}'
      AND j.id::text<>v_s.evidence#>>'{repair_context,previous_job_id}'
      AND j.model IS NOT DISTINCT FROM v_s.evidence#>>'{repair_context,model}'
      AND j.settings->>'aspect_ratio'=v_s.evidence#>>'{repair_context,aspect_ratio}'
      AND j.settings->>'count'='1' AND j.prompt<>v_s.evidence#>>'{repair_context,previous_prompt}'
      AND j.settings#>'{quality,required_character_asset_ids}'=v_s.evidence#>'{repair_context,required_character_asset_ids}'
      AND j.settings#>'{quality,attached_character_asset_ids}'=v_s.evidence#>'{repair_context,required_character_asset_ids}'
   ) THEN RAISE EXCEPTION 'Native repair needs one distinct ready zero-credit job with the original edit target and actual locked references'; END IF;
   IF (SELECT count(*) FROM public.cbted_media_jobs j WHERE j.run_id=p_run AND j.step_key=p_step
       AND j.status IN ('ready','approved','awaiting_quote','awaiting_approval','claimed','submitted','needs_review'))<>1
   THEN RAISE EXCEPTION 'Exactly one live repair job is required'; END IF;
 END IF;
 IF v_s.approval_required THEN
   SELECT decision INTO v_decision FROM public.production_approvals
   WHERE run_id=p_run AND step_key=p_step ORDER BY created_at DESC,id DESC LIMIT 1;
   IF v_decision IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Explicit approval required';END IF;
 END IF;
 UPDATE public.production_steps SET status='in_progress',attempt_number=attempt_number+1,started_at=now()
 WHERE id=v_s.id;
 UPDATE public.production_runs SET status='active' WHERE id=p_run;
 RETURN jsonb_build_object('step_id',v_s.id,'step_key',v_s.step_key,'agent',v_s.agent,'studio',v_s.studio,'kind',v_s.kind,'attempt',v_s.attempt_number+1);
END $function$;
CREATE OR REPLACE FUNCTION public.cbted_claim_media_job(p_job uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_uid uuid:=auth.uid();
 v_job public.cbted_media_jobs%rowtype;
 v_reserved numeric(12,3):=0;
begin
 if v_uid is null then raise exception 'Sign in required'; end if;
 select * into v_job from public.cbted_media_jobs where id=p_job and owner_id=v_uid for update;
 if not found then raise exception 'Media job not found'; end if;
 if v_job.status not in ('ready','approved') then raise exception 'Media job is not authorised for generation'; end if;
 if exists(select 1 from public.production_steps s where s.run_id=v_job.run_id and s.step_key=v_job.step_key
    and s.evidence ? 'repair_context') then
   if not exists(select 1 from public.production_steps s where s.run_id=v_job.run_id and s.step_key=v_job.step_key
      and s.status='in_progress' and s.kind='image' and v_job.provider='chatgpt' and v_job.kind='image'
      and v_job.billing_mode='native' and v_job.quote_credits=0 and not v_job.approval_required and v_job.status='ready'
      and v_job.source_asset_id::text=s.evidence#>>'{repair_context,rejected_asset_id}'
      and v_job.id::text<>s.evidence#>>'{repair_context,previous_job_id}'
      and v_job.model is not distinct from s.evidence#>>'{repair_context,model}'
      and v_job.settings->>'aspect_ratio'=s.evidence#>>'{repair_context,aspect_ratio}'
      and v_job.settings->>'count'='1' and v_job.prompt<>s.evidence#>>'{repair_context,previous_prompt}'
      and v_job.settings#>'{quality,required_character_asset_ids}'=s.evidence#>'{repair_context,required_character_asset_ids}'
      and v_job.settings#>'{quality,attached_character_asset_ids}'=s.evidence#>'{repair_context,required_character_asset_ids}'
   ) then raise exception 'Repair media claim must match the authorised native edit target and reference contract'; end if;
   if (select count(*) from public.cbted_media_jobs m where m.run_id=v_job.run_id and m.step_key=v_job.step_key
     and m.status in ('ready','approved','awaiting_quote','awaiting_approval','claimed','submitted','needs_review'))<>1
   then raise exception 'Exactly one live repair job is required'; end if;
 end if;
 if v_job.provider <> 'chatgpt' then
   if v_job.quote_credits is null or v_job.quote_observed_at is null
      or (v_job.status='approved' and v_job.quote_observed_at < now()-interval '15 minutes')
      or (v_job.status='ready' and v_job.quote_observed_at < now()-interval '2 minutes')
   then raise exception 'Credit quote expired: check credits again'; end if;
   if v_job.status='ready' then
     if v_job.allowance_source <> 'provider_tool' or v_job.allowance_observed_at is null
        or v_job.allowance_observed_at < now()-interval '2 minutes'
        or v_job.allowance_included_remaining is null
     then raise exception 'Fresh included-allowance verification required'; end if;
     perform pg_advisory_xact_lock(hashtext(v_uid::text),hashtext(v_job.provider));
     select coalesce(sum(j.quote_credits),0) into v_reserved
     from public.cbted_media_jobs j where j.owner_id=v_uid and j.provider=v_job.provider
      and j.id<>v_job.id and j.claimed_at >= v_job.allowance_observed_at
      and j.status in ('claimed','submitted','completed','failed');
     if v_job.quote_credits+v_reserved>v_job.allowance_included_remaining then
       update public.cbted_media_jobs set status='awaiting_approval',
        approval_required=true,approval_reason='Monthly included allowance exhausted by other generation jobs',
        updated_at=now() where id=p_job;
       return jsonb_build_object('claimed',false,'approval_required',true,
           'reason','Included allowance is insufficient. Request a specific credit approval.');
     end if;
   else
     if v_job.approved_at is null or v_job.approved_fingerprint is distinct from v_job.quote_fingerprint
        or v_job.approved_max_credits < v_job.quote_credits
     then raise exception 'Quote changed or approved credit maximum is insufficient'; end if;
   end if;
 end if;
 update public.cbted_media_jobs set status='claimed',claimed_at=now(),updated_at=now() where id=p_job;
 insert into public.cbted_media_job_events(owner_id,job_id,event,details)
 values(v_uid,p_job,'claimed',jsonb_build_object('provider',v_job.provider,'credits',v_job.quote_credits));
 return jsonb_build_object('claimed',true,'provider',v_job.provider,'kind',v_job.kind,
   'max_credits',v_job.quote_credits,'quote_fingerprint',v_job.quote_fingerprint);
end; $function$;

