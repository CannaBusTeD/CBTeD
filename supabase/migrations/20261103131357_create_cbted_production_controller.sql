-- CBTeD production controller. Additive: does not modify existing project/task/asset records.
-- The orchestrator alone owns transitions through audited SECURITY DEFINER RPCs.
CREATE TABLE IF NOT EXISTS public.production_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
 request_id uuid NOT NULL DEFAULT gen_random_uuid(),
 workflow text NOT NULL CHECK (workflow IN ('writing','visual','animation','song_video')),
 intent text NOT NULL DEFAULT 'execute' CHECK (intent='execute'),
 instructions text NOT NULL CHECK (char_length(instructions) BETWEEN 1 AND 20000),
 source_version_id uuid,
 rules_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','active','completed','cancelled','blocked')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id,project_id), UNIQUE(project_id,request_id)
);
CREATE TABLE IF NOT EXISTS public.production_steps (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 run_id uuid NOT NULL,
 project_id uuid NOT NULL,
 step_key text NOT NULL CHECK (char_length(step_key) BETWEEN 3 AND 120),
 sequence_index integer NOT NULL CHECK (sequence_index BETWEEN 1 AND 200),
 agent text NOT NULL CHECK (char_length(agent) BETWEEN 3 AND 120),
 studio text NOT NULL CHECK (studio IN ('writing','visual','audio','animation','core')),
 kind text NOT NULL CHECK (kind IN ('text','image','video','audio')),
 depends_on text[] NOT NULL DEFAULT '{}',
 approval_required boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','passed','failed')),
 attempt_number integer NOT NULL DEFAULT 0 CHECK(attempt_number BETWEEN 0 AND 5),
 output_text text,
 asset_id uuid,
 evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
 started_at timestamptz,
 finished_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(run_id,step_key),
 UNIQUE(run_id,sequence_index),
 FOREIGN KEY (run_id,project_id) REFERENCES public.production_runs(id,project_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.production_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 run_id uuid NOT NULL,
 project_id uuid NOT NULL,
 step_key text NOT NULL,
 decision text NOT NULL CHECK(decision IN ('approved','rejected','revoked')),
 decided_by uuid NOT NULL REFERENCES auth.users(id),
 note text,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (run_id,project_id) REFERENCES public.production_runs(id,project_id) ON DELETE CASCADE,
 FOREIGN KEY (run_id,step_key) REFERENCES public.production_steps(run_id,step_key)
);
CREATE INDEX IF NOT EXISTS production_steps_run_status_idx ON public.production_steps(run_id,status);
CREATE INDEX IF NOT EXISTS production_approvals_latest_idx ON public.production_approvals(run_id,step_key,created_at DESC);
ALTER TABLE public.production_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY production_runs_owner_read ON public.production_runs FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.projects p WHERE p.id=project_id AND p.owner_id=(SELECT auth.uid())));
CREATE POLICY production_steps_owner_read ON public.production_steps FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.projects p WHERE p.id=project_id AND p.owner_id=(SELECT auth.uid())));
CREATE POLICY production_approvals_owner_read ON public.production_approvals FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.projects p WHERE p.id=project_id AND p.owner_id=(SELECT auth.uid())));
REVOKE ALL ON public.production_runs,public.production_steps,public.production_approvals FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.production_runs,public.production_steps,public.production_approvals TO authenticated;
-- Deterministic, order-stable snapshot of the current locked rule revisions.
CREATE OR REPLACE FUNCTION public.cbted_locked_rules(p_project uuid) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('scope',r.scope,'key',r.rule_key,'revision',r.revision_number,'body',r.body) ORDER BY r.scope,r.rule_key),'[]'::jsonb)
 FROM (
   SELECT DISTINCT ON (scope,rule_key) scope,rule_key,revision_number,body,is_locked
   FROM public.project_rules WHERE project_id=p_project
   ORDER BY scope,rule_key,revision_number DESC
 ) r WHERE r.is_locked
 $$;
REVOKE ALL ON FUNCTION public.cbted_locked_rules(uuid) FROM PUBLIC,anon,authenticated;
-- Prepare is one transaction. The plan is data; no content generation occurs here.
CREATE OR REPLACE FUNCTION public.cbted_prepare_production(
 p_project uuid,p_request uuid,p_workflow text,p_instructions text,p_source uuid,p_steps jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid:=auth.uid();v_run uuid;v_step jsonb;v_keys text[]:='{}';v_dep text;v_ix int:=0;
BEGIN
 IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.projects WHERE id=p_project AND owner_id=v_uid)
   THEN RAISE EXCEPTION 'Project access denied';END IF;
 IF p_workflow NOT IN ('writing','visual','animation','song_video') OR p_instructions IS NULL OR char_length(p_instructions) NOT BETWEEN 1 AND 20000
   THEN RAISE EXCEPTION 'Invalid production request';END IF;
 IF jsonb_typeof(p_steps) IS DISTINCT FROM 'array' OR jsonb_array_length(p_steps) NOT BETWEEN 1 AND 200
   THEN RAISE EXCEPTION 'Invalid production step count';END IF;
 IF p_source IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.source_versions WHERE id=p_source AND project_id=p_project)
   THEN RAISE EXCEPTION 'Source version does not belong to project';END IF;
 INSERT INTO public.production_runs(project_id,request_id,workflow,instructions,source_version_id,rules_snapshot)
 VALUES (p_project,coalesce(p_request,gen_random_uuid()),p_workflow,p_instructions,p_source,public.cbted_locked_rules(p_project))
 RETURNING id INTO v_run;
 FOR v_step IN SELECT value FROM jsonb_array_elements(p_steps) LOOP
   v_ix:=v_ix+1;
   IF coalesce(v_step->>'key','') !~ '^[a-z][a-z0-9_]{2,119}$' OR v_step->>'key'=ANY(v_keys)
     OR coalesce(v_step->>'agent','') !~ '^[a-z][a-z0-9_]{2,119}$'
     OR v_step->>'studio' NOT IN ('writing','visual','audio','animation','core')
     OR v_step->>'kind' NOT IN ('text','image','video','audio')
     OR jsonb_typeof(v_step->'depends_on') IS DISTINCT FROM 'array'
     THEN RAISE EXCEPTION 'Malformed or repeated step';END IF;
   FOR v_dep IN SELECT jsonb_array_elements_text(v_step->'depends_on') LOOP
     IF NOT v_dep=ANY(v_keys) THEN RAISE EXCEPTION 'Dependency must precede step';END IF;
   END LOOP;
   IF v_step->>'kind' IN ('image','video','audio') AND coalesce((v_step->>'approval_required')::boolean,false)=false
     THEN RAISE EXCEPTION 'Media execution must require explicit approval';END IF;
   INSERT INTO public.production_steps(run_id,project_id,sequence_index,step_key,agent,studio,kind,depends_on,approval_required)
   VALUES(v_run,p_project,v_ix,v_step->>'key',v_step->>'agent',v_step->>'studio',v_step->>'kind',
     ARRAY(SELECT jsonb_array_elements_text(v_step->'depends_on')),coalesce((v_step->>'approval_required')::boolean,false));
   v_keys:=array_append(v_keys,v_step->>'key');
 END LOOP;
 RETURN v_run;
END $$;
REVOKE ALL ON FUNCTION public.cbted_prepare_production(uuid,uuid,text,text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cbted_prepare_production(uuid,uuid,text,text,uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.cbted_decide_production_step(p_run uuid,p_step text,p_decision text,p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid:=auth.uid();v_project uuid;v_id uuid;
BEGIN
 SELECT r.project_id INTO v_project FROM public.production_runs r JOIN public.projects p ON p.id=r.project_id
 WHERE r.id=p_run AND p.owner_id=v_uid AND r.status NOT IN ('completed','cancelled');
 IF v_project IS NULL THEN RAISE EXCEPTION 'Run access denied or closed';END IF;
 IF p_decision NOT IN ('approved','rejected','revoked') OR NOT EXISTS(SELECT 1 FROM public.production_steps WHERE run_id=p_run AND step_key=p_step AND approval_required)
   THEN RAISE EXCEPTION 'Decision requires an approvable step';END IF;
 INSERT INTO public.production_approvals(run_id,project_id,step_key,decision,decided_by,note)
 VALUES(p_run,v_project,p_step,p_decision,v_uid,left(p_note,2000)) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.cbted_decide_production_step(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cbted_decide_production_step(uuid,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cbted_claim_production_step(p_run uuid,p_step text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid:=auth.uid();v_r public.production_runs%ROWTYPE;v_s public.production_steps%ROWTYPE;v_remaining int;v_decision text;
BEGIN
 SELECT r.* INTO v_r FROM public.production_runs r JOIN public.projects p ON p.id=r.project_id
 WHERE r.id=p_run AND p.owner_id=v_uid FOR UPDATE OF r;
 IF v_r.id IS NULL THEN RAISE EXCEPTION 'Run access denied';END IF;
 IF v_r.status NOT IN ('prepared','active') THEN RAISE EXCEPTION 'Run is not active';END IF;
 IF v_r.rules_snapshot IS DISTINCT FROM public.cbted_locked_rules(v_r.project_id)
   THEN RAISE EXCEPTION 'Locked rules changed; replan before executing';END IF;
 SELECT * INTO v_s FROM public.production_steps WHERE run_id=p_run AND step_key=p_step FOR UPDATE;
 IF v_s.id IS NULL OR v_s.status <> 'pending' OR v_s.attempt_number >=5 THEN RAISE EXCEPTION 'Step is not pending';END IF;
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
END $$;
REVOKE ALL ON FUNCTION public.cbted_claim_production_step(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cbted_claim_production_step(uuid,text) TO authenticated;

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
    SELECT 1 FROM public.assets a WHERE a.id=p_asset AND a.project_id=v_r.project_id AND a.storage_path IS NOT NULL AND a.storage_path<>''
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
REVOKE ALL ON FUNCTION public.cbted_finish_production_step(uuid,text,text,text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cbted_finish_production_step(uuid,text,text,text,uuid,jsonb) TO authenticated;
-- Failures require an explicit retry action; preserve earlier passed stages.
CREATE OR REPLACE FUNCTION public.cbted_retry_production_step(p_run uuid,p_step text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid:=auth.uid();
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.production_runs r JOIN public.projects p ON p.id=r.project_id WHERE r.id=p_run AND p.owner_id=v_uid AND r.status='blocked')
 THEN RAISE EXCEPTION 'Blocked owned run required';END IF;
 UPDATE public.production_steps SET status='pending',started_at=NULL,finished_at=NULL
 WHERE run_id=p_run AND step_key=p_step AND status='failed' AND attempt_number<5;
 IF NOT FOUND THEN RAISE EXCEPTION 'Only a failed step with attempts remaining can retry';END IF;
 UPDATE public.production_runs SET status='active' WHERE id=p_run;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.cbted_retry_production_step(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cbted_retry_production_step(uuid,text) TO authenticated;
