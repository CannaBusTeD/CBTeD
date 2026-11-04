-- Preserve failed review evidence before restarting a full-song editorial cycle.
CREATE TABLE IF NOT EXISTS public.production_step_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 run_id uuid NOT NULL,
 project_id uuid NOT NULL,
 step_key text NOT NULL,
 attempt_number integer NOT NULL CHECK(attempt_number BETWEEN 1 AND 5),
 status text NOT NULL CHECK(status IN ('passed','failed')),
 output_text text,
 evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(run_id,step_key,attempt_number),
 FOREIGN KEY(run_id,project_id) REFERENCES public.production_runs(id,project_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS production_step_attempts_run_idx ON public.production_step_attempts(run_id,recorded_at DESC);
ALTER TABLE public.production_step_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY production_step_attempts_owner_read ON public.production_step_attempts FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.projects p WHERE p.id=project_id AND p.owner_id=(SELECT auth.uid())));
REVOKE ALL ON public.production_step_attempts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.production_step_attempts TO authenticated;

CREATE OR REPLACE FUNCTION public.cbted_retry_production_step(p_run uuid,p_step text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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

 IF v_r.workflow='writing_rewrite' AND p_step='writing_review' THEN
   -- One failed full-lyric review must reopen the WHOLE editorial chain.
   -- Preserve every previous creative stage before clearing its working outputs.
   INSERT INTO public.production_step_attempts(run_id,project_id,step_key,attempt_number,status,output_text,evidence)
   SELECT s.run_id,s.project_id,s.step_key,s.attempt_number,s.status,s.output_text,s.evidence
   FROM public.production_steps s WHERE s.run_id=p_run AND s.studio='writing'
    AND s.status IN ('passed','failed')
   ON CONFLICT(run_id,step_key,attempt_number) DO NOTHING;
   UPDATE public.production_steps SET
     status='pending',output_text=NULL,asset_id=NULL,evidence='{}'::jsonb,
     started_at=NULL,finished_at=NULL
   WHERE run_id=p_run AND studio='writing';
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
END $$;
REVOKE ALL ON FUNCTION public.cbted_retry_production_step(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cbted_retry_production_step(uuid,text) TO authenticated;
