-- Prevent a caller from silently deleting mandatory CBTeD stages from a workflow.
-- The backend recomputes its own canonical stage graph rather than trusting submitted JSON.
CREATE OR REPLACE FUNCTION public.cbted_stage_record(
 p_key text,p_agent text,p_studio text,p_kind text,p_depends text[],p_approval boolean
) RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('key',p_key,'agent',p_agent,'studio',p_studio,
    'kind',p_kind,'depends_on',to_jsonb(p_depends),'approval_required',p_approval)
$$;
REVOKE ALL ON FUNCTION public.cbted_stage_record(text,text,text,text,text[],boolean) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.cbted_canonical_plan(
 p_workflow text,p_image_count integer,p_video_count integer
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE
 v_result jsonb:='[]'::jsonb;
 v_prev text; v_writing text; v_visual text; v_audio text;
 v_key text; v_agent text; v_i integer;
BEGIN
 IF p_workflow NOT IN ('writing','visual','animation','song_video')
 THEN RAISE EXCEPTION 'Unknown production workflow'; END IF;
 IF p_image_count < 0 OR p_video_count < 0 OR p_image_count>20 OR p_video_count>20
 THEN RAISE EXCEPTION 'Invalid production count'; END IF;
 IF (p_workflow IN ('writing','animation') AND p_image_count<>0)
 OR (p_workflow IN ('writing','visual') AND p_video_count<>0)
 OR (p_workflow IN ('visual','song_video') AND p_image_count<1)
 OR (p_workflow IN ('animation','song_video') AND p_video_count<1)
 THEN RAISE EXCEPTION 'Missing or unexpected media operations'; END IF;

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
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.cbted_canonical_plan(text,integer,integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.cbted_prepare_production(
 p_project uuid,p_request uuid,p_workflow text,p_instructions text,p_source uuid,p_steps jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid:=auth.uid();v_run uuid;v_step jsonb;v_keys text[]:='{}';v_dep text;v_ix int:=0;v_img int;v_vid int;v_normalized jsonb;
BEGIN
 IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.projects WHERE id=p_project AND owner_id=v_uid)
   THEN RAISE EXCEPTION 'Project access denied';END IF;
 IF p_workflow NOT IN ('writing','visual','animation','song_video') OR p_instructions IS NULL OR char_length(p_instructions) NOT BETWEEN 1 AND 20000
   THEN RAISE EXCEPTION 'Invalid production request';END IF;
 IF jsonb_typeof(p_steps) IS DISTINCT FROM 'array' OR jsonb_array_length(p_steps) NOT BETWEEN 1 AND 200
   THEN RAISE EXCEPTION 'Invalid production step count';END IF;
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
