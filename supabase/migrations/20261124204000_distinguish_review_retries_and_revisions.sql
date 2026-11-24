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
 IF v_s.id IS NULL OR v_s.status <> 'pending' OR (v_s.attempt_number >=5 AND NOT (v_s.step_key IN ('writing_rewrite','writing_proofread') AND EXISTS (SELECT 1 FROM public.production_step_attempts a WHERE a.run_id=p_run AND a.step_key=p_step AND a.attempt_number=v_s.attempt_number AND a.status='passed'))) THEN RAISE EXCEPTION 'Step is not pending';END IF;
 SELECT count(*) INTO v_remaining FROM unnest(v_s.depends_on) AS d(key)
 LEFT JOIN public.production_steps done ON done.run_id=p_run AND done.step_key=d.key AND done.status='passed'
 WHERE done.id IS NULL;
 IF v_remaining>0 THEN RAISE EXCEPTION 'Previous required stage has not passed';END IF;
 IF v_s.approval_required THEN
   SELECT decision INTO v_decision FROM public.production_approvals
   WHERE run_id=p_run AND step_key=p_step ORDER BY created_at DESC,id DESC LIMIT 1;
   IF v_decision IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Explicit approval required';END IF;
 END IF;
 UPDATE public.production_steps SET status='in_progress',attempt_number=attempt_number+1,started_at=now()
 WHERE id=v_s.id;
 UPDATE public.production_runs SET status='active' WHERE id=p_run;
 RETURN jsonb_build_object('step_id',v_s.id,'step_key',v_s.step_key,'agent',v_s.agent,'studio',v_s.studio,'kind',v_s.kind,'attempt',v_s.attempt_number+1);
END $function$
;
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
 IF v_failed.id IS NULL OR v_failed.status<>'failed' OR v_failed.attempt_number>=5 THEN
   RAISE EXCEPTION 'Only a failed stage with attempts remaining may retry';
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
END $function$
;
