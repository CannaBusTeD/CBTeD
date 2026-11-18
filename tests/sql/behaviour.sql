\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
INSERT INTO auth.users VALUES ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
INSERT INTO public.projects(id,owner_id,title) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Ted test project');
CREATE FUNCTION public.try(q text) RETURNS text LANGUAGE plpgsql AS $$DECLARE r text; BEGIN EXECUTE q INTO r; RETURN 'OK '||coalesce(r,''); EXCEPTION WHEN OTHERS THEN RETURN 'ERROR '||SQLERRM; END$$;
GRANT EXECUTE ON FUNCTION public.try(text) TO authenticated;
GRANT SELECT ON test_inputs TO authenticated;
GRANT SELECT ON public.production_runs,public.production_steps,public.production_approvals TO authenticated; -- live grants app roles read-only table access
CREATE FUNCTION public.prep(name text,wf text) RETURNS text LANGUAGE sql AS $$
  SELECT public.try(format('SELECT public.cbted_prepare_production(%L,gen_random_uuid(),%L,%L,NULL,(SELECT steps FROM test_inputs WHERE name=%L))::text',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',wf,'Short video: my idea in my own words',name)) $$;
GRANT EXECUTE ON FUNCTION public.prep(text,text) TO authenticated;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false) IS NOT NULL AS _ \gset
SELECT '01 other user cannot use Ted''s project: '||public.prep('idea_1_1','idea_to_publish');
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false) IS NOT NULL AS _ \gset
SELECT '02 app role cannot call planner directly: '||public.try($$SELECT public.cbted_canonical_plan('idea_to_publish',1,1)::text$$);
SELECT '03 tampered: publish without approval: '||public.prep('tamper_no_publish_approval','idea_to_publish');
SELECT '04 tampered: writing without idea approval: '||public.prep('tamper_no_idea_approval','idea_to_publish');
SELECT '05 tampered: skip idea critique: '||public.prep('tamper_skip_critique','idea_to_publish');
SELECT '06 tampered: skip publish plan: '||public.prep('tamper_skip_publish_plan','idea_to_publish');
SELECT '07 existing visual workflow still registers: '||left(public.prep('visual_1','visual'),3);
SELECT '08 existing song_video workflow still registers: '||left(public.prep('song_video_1_1','song_video'),3);
SELECT '09 idea_to_publish 2 images 2 clips registers: '||left(public.prep('idea_2_2','idea_to_publish'),3);
SELECT substr(public.prep('idea_1_1','idea_to_publish'),4) AS run \gset
SELECT '10 idea_to_publish 1 image 1 clip registered, stages: '||count(*)||', publish stage: '||string_agg(step_key||'/'||studio||'/'||kind||'/approval='||approval_required,'') FILTER (WHERE kind='publish') FROM public.production_steps WHERE run_id=:'run';
SELECT '11 claim idea_develop: '||left(public.try(format('SELECT public.cbted_claim_production_step(%L,%L)::text',:'run','idea_develop')),2);
SELECT '12 finish idea_develop: '||public.try(format('SELECT public.cbted_finish_production_step(%L,%L,%L,%L)::text',:'run','idea_develop','passed','Concept: ...'));
RESET ROLE;
UPDATE public.production_steps SET status='passed',output_text='ok' WHERE run_id=:'run' AND step_key IN ('idea_critique','idea_refine');
SET ROLE authenticated;
SELECT '13 writing before idea approval: '||public.try(format('SELECT public.cbted_claim_production_step(%L,%L)::text',:'run','writing_draft'));
SELECT '14 approve the idea: '||left(public.try(format('SELECT public.cbted_decide_production_step(%L,%L,%L,%L)::text',:'run','writing_draft','approved','Ted approved the idea')),2);
SELECT '15 writing after idea approval: '||left(public.try(format('SELECT public.cbted_claim_production_step(%L,%L)::text',:'run','writing_draft')),2);
RESET ROLE;
UPDATE public.production_steps SET status='passed',output_text=CASE WHEN kind='text' THEN 'ok' END WHERE run_id=:'run' AND sequence_index<=(SELECT sequence_index FROM public.production_steps WHERE run_id=:'run' AND step_key='release_audit');
SET ROLE authenticated;
SELECT '16 claim publish_plan: '||left(public.try(format('SELECT public.cbted_claim_production_step(%L,%L)::text',:'run','publish_plan')),2);
SELECT '17 finish publish_plan: '||public.try(format('SELECT public.cbted_finish_production_step(%L,%L,%L,%L)::text',:'run','publish_plan','passed','YouTube title: ...'));
SELECT '18 publish before approval: '||public.try(format('SELECT public.cbted_claim_production_step(%L,%L)::text',:'run','publish_send'));
SELECT '19 approve publishing: '||left(public.try(format('SELECT public.cbted_decide_production_step(%L,%L,%L,%L)::text',:'run','publish_send','approved','Ted approved')),2);
SELECT '20 claim publish after approval: '||left(public.try(format('SELECT public.cbted_claim_production_step(%L,%L)::text',:'run','publish_send')),2);
SELECT '21 anyone marking it published: '||public.try(format('SELECT public.cbted_finish_production_step(%L,%L,%L,%L)::text',:'run','publish_send','passed','I posted it, trust me'));
SELECT '22 recording it as failed: '||public.try(format('SELECT public.cbted_finish_production_step(%L,%L,%L,NULL,NULL,%L)::text',:'run','publish_send','failed','{"reason":"publishing not connected"}'));
SELECT '23 run status now: '||status FROM public.production_runs WHERE id=:'run';
SELECT '24 verify before a real post: '||public.try(format('SELECT public.cbted_claim_production_step(%L,%L)::text',:'run','publish_verify'));
SELECT '25 retry the publish stage: '||public.try(format('SELECT public.cbted_retry_production_step(%L,%L)::text',:'run','publish_send'));
SELECT '26 after retry: run '||r.status||', publish_send '||s.status FROM public.production_runs r JOIN public.production_steps s ON s.run_id=r.id AND s.step_key='publish_send' WHERE r.id=:'run';
SELECT '27 verify still refused after retry: '||public.try(format('SELECT public.cbted_claim_production_step(%L,%L)::text',:'run','publish_verify'));
RESET ROLE;
SELECT '28 runs created in total: '||count(*)||' ('||string_agg(DISTINCT workflow,', ')||')' FROM public.production_runs;
