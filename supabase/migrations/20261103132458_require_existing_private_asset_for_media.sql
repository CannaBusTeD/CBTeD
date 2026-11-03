-- Tighten private media proof: a metadata row alone is not a real output.
CREATE OR REPLACE FUNCTION public.cbted_finish_production_step(
 p_run uuid,p_step text,p_result text,p_text text DEFAULT NULL,p_asset uuid DEFAULT NULL,p_evidence jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid:=auth.uid();v_r public.production_runs%ROWTYPE;v_s public.production_steps%ROWTYPE;v_left int;
BEGIN
 SELECT r.* INTO v_r FROM public.production_runs r JOIN public.projects p ON p.id=r.project_id
 WHERE r.id=p_run AND p.owner_id=v_uid FOR UPDATE OF r;
 IF v_r.id IS NULL THEN RAISE EXCEPTION 'Run access denied';END IF;
 SELECT * INTO v_s FROM public.production_steps WHERE run_id=p_run AND step_key=p_step FOR UPDATE;
 IF v_s.id IS NULL OR v_s.status<>'in_progress' THEN RAISE EXCEPTION 'No active claim to finish';END IF;
 IF p_result NOT IN ('passed','failed') THEN RAISE EXCEPTION 'Invalid result';END IF;
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
 ELSE
   SELECT count(*) INTO v_left FROM public.production_steps WHERE run_id=p_run AND status<>'passed';
   IF v_left=0 THEN UPDATE public.production_runs SET status='completed' WHERE id=p_run;END IF;
 END IF;
 RETURN jsonb_build_object('step',p_step,'status',p_result,'run_completed',p_result='passed' AND v_left=0);
END $$;
