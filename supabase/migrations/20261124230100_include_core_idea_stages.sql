CREATE OR REPLACE FUNCTION public.cbted_delegated_stage(p_run uuid,p_secret text,p_action text,p_step text DEFAULT NULL,p_ticket uuid DEFAULT NULL,p_result text DEFAULT NULL,p_text text DEFAULT NULL,p_evidence jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE g public.cbted_run_delegations%ROWTYPE; project uuid; ticket uuid;
BEGIN
 SELECT d.* INTO g FROM public.cbted_run_delegations d JOIN public.production_runs r ON r.id=d.run_id JOIN public.projects p ON p.id=r.project_id AND p.owner_id=d.owner_id WHERE d.run_id=p_run AND d.digest=sha256(convert_to(p_secret,'UTF8')) FOR UPDATE OF d;
 IF NOT FOUND OR (NOT g.active AND p_action<>'finish') THEN RAISE EXCEPTION 'Inactive run delegation'; END IF;
 SELECT project_id INTO project FROM public.production_runs WHERE id=p_run;
 IF p_action='scope' THEN RETURN jsonb_build_object('owner_id',g.owner_id,'project_id',project); END IF;
 IF p_step IS NULL OR NOT EXISTS (SELECT 1 FROM public.production_steps WHERE run_id=p_run AND step_key=p_step AND kind='text' AND studio IN ('core','writing','visual','audio','animation') AND agent NOT IN ('audio_reviewer','video_reviewer','image_reviewer','release_auditor'))
 THEN RAISE EXCEPTION 'Stage outside run delegation'; END IF;
 -- Only the service-role-only function may invoke these fixed operations after validating the run capability.
 PERFORM set_config('request.jwt.claim.sub',g.owner_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',g.owner_id,'role','authenticated')::text,true);
 IF p_action='claim' THEN
  IF g.claim_ticket IS NOT NULL AND EXISTS (SELECT 1 FROM public.production_steps WHERE run_id=p_run AND step_key=g.claimed_step AND status='in_progress') THEN RAISE EXCEPTION 'Stage already claimed'; END IF;
  PERFORM public.cbted_claim_production_step(p_run,p_step);
  ticket:=gen_random_uuid(); UPDATE public.cbted_run_delegations SET claimed_step=p_step,claim_ticket=ticket,claimed_at=now() WHERE run_id=p_run;
  RETURN to_jsonb(ticket);
 ELSIF p_action='finish' THEN
  IF p_ticket IS NULL OR g.claim_ticket IS DISTINCT FROM p_ticket OR g.claimed_step IS DISTINCT FROM p_step THEN RAISE EXCEPTION 'Claim receipt required'; END IF;
  PERFORM public.cbted_finish_production_step(p_run,p_step,p_result,p_text,NULL,p_evidence);
  UPDATE public.cbted_run_delegations SET claim_ticket=NULL,claimed_step=NULL,claimed_at=NULL WHERE run_id=p_run;
 ELSIF p_action='retry' AND p_step='writing_review' THEN
  PERFORM public.cbted_retry_production_step(p_run,p_step);
 ELSE RAISE EXCEPTION 'Unsupported delegated operation'; END IF;
 RETURN '{}'::jsonb;
END $$;
REVOKE ALL ON FUNCTION public.cbted_delegated_stage(uuid,text,text,text,uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cbted_delegated_stage(uuid,text,text,text,uuid,text,text,jsonb) TO service_role;
