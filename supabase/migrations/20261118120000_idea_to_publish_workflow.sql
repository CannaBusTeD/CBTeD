-- CBTeD idea-to-publish workflow. Additive: every existing workflow keeps exactly the same canonical stages.
--
-- Adds workflow 'idea_to_publish':
--   idea (develop, critique, refine) > creator approves the idea > writing (7 stages) > story storyboard >
--   images (each approved) > motion storyboard > video clips (each approved) > assembly (approved) >
--   release audit > publish plan > publish send (approved) > publish verify
-- Adds step studio 'publish' and step kind 'publish'.
--
-- Safety:
--   * A 'publish' step must require explicit approval, like image, video and audio steps.
--   * Nothing can mark a 'publish' step as passed yet. The future publishing service will replace that
--     check with verification of a real provider result, so publishing fails closed until it exists.
--   * The three functions below are the live definitions (verified byte-for-byte on 2026-11-18)
--     with additions only. Grants on existing functions are kept by CREATE OR REPLACE.

ALTER TABLE public.production_runs DROP CONSTRAINT production_runs_workflow_check;
ALTER TABLE public.production_runs ADD CONSTRAINT production_runs_workflow_check
 CHECK ((workflow = ANY (ARRAY['writing'::text, 'writing_critique'::text, 'writing_suggestions'::text, 'writing_line_edit'::text, 'writing_rewrite'::text, 'visual'::text, 'animation'::text, 'song_video'::text, 'idea_to_publish'::text])));
ALTER TABLE public.production_steps DROP CONSTRAINT production_steps_studio_check;
ALTER TABLE public.production_steps ADD CONSTRAINT production_steps_studio_check
 CHECK ((studio = ANY (ARRAY['writing'::text, 'visual'::text, 'audio'::text, 'animation'::text, 'core'::text, 'publish'::text])));
ALTER TABLE public.production_steps DROP CONSTRAINT production_steps_kind_check;
ALTER TABLE public.production_steps ADD CONSTRAINT production_steps_kind_check
 CHECK ((kind = ANY (ARRAY['text'::text, 'image'::text, 'video'::text, 'audio'::text, 'publish'::text])));

CREATE OR REPLACE FUNCTION public.cbted_canonical_plan(p_workflow text, p_image_count integer, p_video_count integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
 v_result jsonb:='[]'::jsonb;
 v_prev text; v_writing text; v_visual text; v_audio text;
 v_key text; v_agent text; v_i integer;
BEGIN
 IF p_workflow NOT IN ('writing','writing_critique','writing_suggestions','writing_line_edit','writing_rewrite','visual','animation','song_video','idea_to_publish')
 THEN RAISE EXCEPTION 'Unknown production workflow'; END IF;
 IF p_image_count < 0 OR p_video_count < 0 OR p_image_count>20 OR p_video_count>20
 THEN RAISE EXCEPTION 'Invalid production count'; END IF;
 IF (p_workflow IN ('writing','writing_critique','writing_suggestions','writing_line_edit','writing_rewrite','animation') AND p_image_count<>0)
 OR (p_workflow IN ('writing','writing_critique','writing_suggestions','writing_line_edit','writing_rewrite','visual') AND p_video_count<>0)
 OR (p_workflow IN ('visual','song_video') AND p_image_count<1)
 OR (p_workflow IN ('animation','song_video') AND p_video_count<1)
 OR (p_workflow='idea_to_publish' AND (p_image_count<1 OR p_video_count<1))
 THEN RAISE EXCEPTION 'Missing or unexpected media operations'; END IF;


 IF p_workflow IN ('writing_critique','writing_suggestions','writing_line_edit','writing_rewrite') THEN
   FOR v_key,v_agent IN
   SELECT key,agent FROM (
     SELECT ord,key,agent FROM (
       VALUES
        (1,'writing_critique','writing_critic'),
        (2,'writing_language_audit','language_auditor'),
        (3,'writing_review','writing_reviewer')
     ) AS c(ord,key,agent) WHERE p_workflow='writing_critique'
     UNION ALL
     SELECT ord,key,agent FROM (
       VALUES
        (1,'writing_critique','writing_critic'),
        (2,'writing_language_audit','language_auditor'),
        (3,'writing_edit','writing_editor'),
        (4,'writing_review','writing_reviewer')
     ) AS c(ord,key,agent) WHERE p_workflow='writing_suggestions'
     UNION ALL
     SELECT ord,key,agent FROM (
       VALUES
        (1,'writing_edit','writing_editor'),
        (2,'writing_language_audit','language_auditor'),
        (3,'writing_review','writing_reviewer')
     ) AS c(ord,key,agent) WHERE p_workflow='writing_line_edit'
     UNION ALL
     SELECT ord,key,agent FROM (
       VALUES
        (1,'writing_critique','writing_critic'),
        (2,'writing_edit','writing_editor'),
        (3,'writing_language_audit','language_auditor'),
        (4,'writing_rewrite','writing_synthesizer'),
        (5,'writing_proofread','writing_proofreader'),
        (6,'writing_review','writing_reviewer')
     ) AS c(ord,key,agent) WHERE p_workflow='writing_rewrite'
   ) AS ordered_steps ORDER BY ord LOOP
     v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
       v_key,v_agent,'writing','text',
       CASE WHEN v_prev IS NULL THEN ARRAY[]::text[] ELSE ARRAY[v_prev] END,false));
     v_prev:=v_key;
   END LOOP;
   v_writing:=v_prev;
 END IF;

 IF p_workflow IN ('writing','song_video') THEN
   FOREACH v_key IN ARRAY ARRAY[
     'writing_draft','writing_critique','writing_edit','writing_language_audit',
     'writing_rewrite','writing_proofread','writing_review'
   ] LOOP
     v_agent:=CASE v_key
       WHEN 'writing_draft' THEN 'writing_author'
       WHEN 'writing_critique' THEN 'writing_critic'
       WHEN 'writing_edit' THEN 'writing_editor'
       WHEN 'writing_language_audit' THEN 'language_auditor'
       WHEN 'writing_rewrite' THEN 'writing_synthesizer'
       WHEN 'writing_proofread' THEN 'writing_proofreader'
       ELSE 'writing_reviewer' END;
     v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
       v_key,v_agent,'writing','text',
       CASE WHEN v_prev IS NULL THEN ARRAY[]::text[] ELSE ARRAY[v_prev] END,false));
     v_prev:=v_key;
   END LOOP;
   v_writing:=v_prev;
 END IF;

 IF p_workflow IN ('visual','song_video') THEN
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'visual_analysis','visual_analyst','visual','text',
     CASE WHEN v_writing IS NULL THEN ARRAY[]::text[] ELSE ARRAY[v_writing] END,false));
   v_prev:='visual_analysis';
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'visual_select_tool','visual_tool_selector','visual','text',ARRAY[v_prev],false));
   v_prev:='visual_select_tool';
   FOR v_i IN 1..p_image_count LOOP
     v_key:='visual_prompt_'||v_i;
     v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
       v_key,'visual_prompt_writer','visual','text',ARRAY[v_prev],false));
     v_prev:=v_key;
     v_key:='visual_generate_'||v_i;
     v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
       v_key,'image_generator','visual','image',ARRAY[v_prev],true));
     v_prev:=v_key;
     v_key:='visual_review_'||v_i;
     v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
       v_key,'image_reviewer','visual','text',ARRAY[v_prev],false));
     v_prev:=v_key;
   END LOOP;
   v_visual:=v_prev;
 END IF;

 IF p_workflow='song_video' THEN
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'audio_direction','audio_director','audio','text',ARRAY[v_writing],false));
   v_prev:='audio_direction';
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'audio_select_tool','audio_tool_selector','audio','text',ARRAY[v_prev],false));
   v_prev:='audio_select_tool';
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'audio_generate','audio_generator','audio','audio',ARRAY[v_prev],true));
   v_prev:='audio_generate';
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'audio_review','audio_reviewer','audio','text',ARRAY[v_prev],false));
   v_audio:='audio_review';
 END IF;

 IF p_workflow IN ('animation','song_video') THEN
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'animation_storyboard','storyboarding_director','animation','text',
     CASE WHEN p_workflow='song_video' THEN ARRAY[v_visual,v_audio] ELSE ARRAY[]::text[] END,false));
   v_prev:='animation_storyboard';
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'animation_motion_plan','motion_prompt_writer','animation','text',ARRAY[v_prev],false));
   v_prev:='animation_motion_plan';
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'animation_select_tool','video_tool_selector','animation','text',ARRAY[v_prev],false));
   v_prev:='animation_select_tool';
   FOR v_i IN 1..p_video_count LOOP
     v_key:='animation_generate_'||v_i;
     v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
       v_key,'video_generator','animation','video',ARRAY[v_prev],true));
     v_prev:=v_key;
     v_key:='animation_review_'||v_i;
     v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
       v_key,'video_reviewer','animation','text',ARRAY[v_prev],false));
     v_prev:=v_key;
   END LOOP;
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'animation_assembly','sequence_assembler','animation','video',ARRAY[v_prev],true));
   v_prev:='animation_assembly';
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'release_audit','release_auditor','core','text',ARRAY[v_prev],false));
 END IF;

 -- idea_to_publish: craft the idea, write it, storyboard it, make the images, plan the motion,
 -- make the clips, assemble, audit, then publish. Self-contained so no existing workflow changes.
 IF p_workflow='idea_to_publish' THEN
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'idea_develop','idea_developer','core','text',ARRAY[]::text[],false));
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'idea_critique','idea_critic','core','text',ARRAY['idea_develop'],false));
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'idea_refine','idea_refiner','core','text',ARRAY['idea_critique'],false));
   v_prev:='idea_refine';
   -- The creator explicitly approves the refined idea before the first draft is written.
   FOREACH v_key IN ARRAY ARRAY[
     'writing_draft','writing_critique','writing_edit','writing_language_audit',
     'writing_rewrite','writing_proofread','writing_review'
   ] LOOP
     v_agent:=CASE v_key
       WHEN 'writing_draft' THEN 'writing_author'
       WHEN 'writing_critique' THEN 'writing_critic'
       WHEN 'writing_edit' THEN 'writing_editor'
       WHEN 'writing_language_audit' THEN 'language_auditor'
       WHEN 'writing_rewrite' THEN 'writing_synthesizer'
       WHEN 'writing_proofread' THEN 'writing_proofreader'
       ELSE 'writing_reviewer' END;
     v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
       v_key,v_agent,'writing','text',ARRAY[v_prev],v_key='writing_draft'));
     v_prev:=v_key;
   END LOOP;
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'story_storyboard','scene_storyboarder','visual','text',ARRAY[v_prev],false));
   v_prev:='story_storyboard';
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'visual_analysis','visual_analyst','visual','text',ARRAY[v_prev],false));
   v_prev:='visual_analysis';
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'visual_select_tool','visual_tool_selector','visual','text',ARRAY[v_prev],false));
   v_prev:='visual_select_tool';
   FOR v_i IN 1..p_image_count LOOP
     v_key:='visual_prompt_'||v_i;
     v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
       v_key,'visual_prompt_writer','visual','text',ARRAY[v_prev],false));
     v_prev:=v_key;
     v_key:='visual_generate_'||v_i;
     v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
       v_key,'image_generator','visual','image',ARRAY[v_prev],true));
     v_prev:=v_key;
     v_key:='visual_review_'||v_i;
     v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
       v_key,'image_reviewer','visual','text',ARRAY[v_prev],false));
     v_prev:=v_key;
   END LOOP;
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'animation_storyboard','storyboarding_director','animation','text',ARRAY[v_prev],false));
   v_prev:='animation_storyboard';
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'animation_motion_plan','motion_prompt_writer','animation','text',ARRAY[v_prev],false));
   v_prev:='animation_motion_plan';
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'animation_select_tool','video_tool_selector','animation','text',ARRAY[v_prev],false));
   v_prev:='animation_select_tool';
   FOR v_i IN 1..p_video_count LOOP
     v_key:='animation_generate_'||v_i;
     v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
       v_key,'video_generator','animation','video',ARRAY[v_prev],true));
     v_prev:=v_key;
     v_key:='animation_review_'||v_i;
     v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
       v_key,'video_reviewer','animation','text',ARRAY[v_prev],false));
     v_prev:=v_key;
   END LOOP;
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'animation_assembly','sequence_assembler','animation','video',ARRAY[v_prev],true));
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'release_audit','release_auditor','core','text',ARRAY['animation_assembly'],false));
   -- Publishing is public and irreversible: the send stage always needs its own explicit approval.
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'publish_plan','publish_planner','publish','text',ARRAY['release_audit'],false));
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'publish_send','publisher','publish','publish',ARRAY['publish_plan'],true));
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'publish_verify','publish_verifier','publish','text',ARRAY['publish_send'],false));
 END IF;
 RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.cbted_prepare_production(p_project uuid, p_request uuid, p_workflow text, p_instructions text, p_source uuid, p_steps jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid:=auth.uid();v_run uuid;v_step jsonb;v_keys text[]:='{}';v_dep text;v_ix int:=0;v_img int;v_vid int;v_normalized jsonb;
BEGIN
 IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.projects WHERE id=p_project AND owner_id=v_uid)
   THEN RAISE EXCEPTION 'Project access denied';END IF;
 IF p_workflow NOT IN ('writing','writing_critique','writing_suggestions','writing_line_edit','writing_rewrite','visual','animation','song_video','idea_to_publish') OR p_instructions IS NULL OR char_length(p_instructions) NOT BETWEEN 1 AND 20000
   THEN RAISE EXCEPTION 'Invalid production request';END IF;
 IF jsonb_typeof(p_steps) IS DISTINCT FROM 'array' OR jsonb_array_length(p_steps) NOT BETWEEN 1 AND 200
   THEN RAISE EXCEPTION 'Invalid production step count';END IF;
 IF p_workflow IN ('writing_critique','writing_suggestions','writing_line_edit','writing_rewrite') AND p_source IS NULL
 THEN RAISE EXCEPTION 'Exact existing source required for writing operation'; END IF;
 IF p_source IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.source_versions WHERE id=p_source AND project_id=p_project)
   THEN RAISE EXCEPTION 'Source version does not belong to project';END IF;

 -- The submitted plan is untrusted, including when it comes from an AI or browser.
 -- Rebuild the full mandatory graph from canonical, server-owned stage definitions.
 SELECT
   count(*) FILTER(WHERE stage->>'agent'='image_generator'),
   count(*) FILTER(WHERE stage->>'agent'='video_generator')
 INTO v_img,v_vid FROM jsonb_array_elements(p_steps) AS stage;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'key',stage->>'key',
   'agent',stage->>'agent',
   'studio',stage->>'studio',
   'kind',stage->>'kind',
   'depends_on',stage->'depends_on',
   'approval_required',stage->'approval_required'
 ) ORDER BY sequence),'[]'::jsonb)
 INTO v_normalized
 FROM jsonb_array_elements(p_steps) WITH ORDINALITY AS stages(stage,sequence);
 IF v_normalized IS DISTINCT FROM public.cbted_canonical_plan(p_workflow,v_img,v_vid)
 THEN RAISE EXCEPTION 'Workflow violates mandatory canonical stages'; END IF;
 INSERT INTO public.production_runs(project_id,request_id,workflow,instructions,source_version_id,rules_snapshot)
 VALUES (p_project,coalesce(p_request,gen_random_uuid()),p_workflow,p_instructions,p_source,public.cbted_locked_rules(p_project))
 RETURNING id INTO v_run;
 FOR v_step IN SELECT value FROM jsonb_array_elements(p_steps) LOOP
   v_ix:=v_ix+1;
   IF coalesce(v_step->>'key','') !~ '^[a-z][a-z0-9_]{2,119}$' OR v_step->>'key'=ANY(v_keys)
     OR coalesce(v_step->>'agent','') !~ '^[a-z][a-z0-9_]{2,119}$'
     OR v_step->>'studio' NOT IN ('writing','visual','audio','animation','core','publish')
     OR v_step->>'kind' NOT IN ('text','image','video','audio','publish')
     OR jsonb_typeof(v_step->'depends_on') IS DISTINCT FROM 'array'
     THEN RAISE EXCEPTION 'Malformed or repeated step';END IF;
   FOR v_dep IN SELECT jsonb_array_elements_text(v_step->'depends_on') LOOP
     IF NOT v_dep=ANY(v_keys) THEN RAISE EXCEPTION 'Dependency must precede step';END IF;
   END LOOP;
   IF v_step->>'kind' IN ('image','video','audio','publish') AND coalesce((v_step->>'approval_required')::boolean,false)=false
     THEN RAISE EXCEPTION 'Media and publishing execution must require explicit approval';END IF;
   INSERT INTO public.production_steps(run_id,project_id,sequence_index,step_key,agent,studio,kind,depends_on,approval_required)
   VALUES(v_run,p_project,v_ix,v_step->>'key',v_step->>'agent',v_step->>'studio',v_step->>'kind',
     ARRAY(SELECT jsonb_array_elements_text(v_step->'depends_on')),coalesce((v_step->>'approval_required')::boolean,false));
   v_keys:=array_append(v_keys,v_step->>'key');
 END LOOP;
 RETURN v_run;
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
 ELSE
   SELECT count(*) INTO v_left FROM public.production_steps WHERE run_id=p_run AND status<>'passed';
   IF v_left=0 THEN UPDATE public.production_runs SET status='completed' WHERE id=p_run;END IF;
 END IF;
 RETURN jsonb_build_object('step',p_step,'status',p_result,'run_completed',p_result='passed' AND v_left=0);
END $function$;

-- Keep the planner helpers private, exactly as before.
REVOKE ALL ON FUNCTION public.cbted_canonical_plan(text,integer,integer) FROM PUBLIC,anon,authenticated;
