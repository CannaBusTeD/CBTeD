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

 IF p_step='writing_review' AND v_r.workflow IN ('writing_rewrite','writing','song_video','song_video_publish','idea_to_publish','idea_to_publish_audio') THEN
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
