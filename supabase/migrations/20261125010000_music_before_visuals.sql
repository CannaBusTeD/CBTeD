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
 IF p_workflow NOT IN ('writing','writing_critique','writing_suggestions','writing_line_edit','writing_rewrite','visual','animation','song_video','idea_to_publish','audio','song_video_publish','idea_to_publish_audio','animation_publish')
 THEN RAISE EXCEPTION 'Unknown production workflow'; END IF;
 IF p_image_count < 0 OR p_video_count < 0 OR p_image_count>20 OR p_video_count>20
 THEN RAISE EXCEPTION 'Invalid production count'; END IF;
 IF (p_workflow IN ('writing','writing_critique','writing_suggestions','writing_line_edit','writing_rewrite','audio','animation','animation_publish') AND p_image_count<>0)
 OR (p_workflow IN ('writing','writing_critique','writing_suggestions','writing_line_edit','writing_rewrite','visual','audio') AND p_video_count<>0)
 OR (p_workflow IN ('visual','song_video','song_video_publish') AND p_image_count<1)
 OR (p_workflow IN ('animation','animation_publish','song_video','song_video_publish') AND p_video_count<1)
 OR (p_workflow IN ('idea_to_publish','idea_to_publish_audio') AND (p_image_count<1 OR p_video_count<1))
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

 IF p_workflow IN ('writing','song_video','song_video_publish') THEN
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

 IF p_workflow IN ('audio','song_video','song_video_publish') THEN
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'audio_direction','audio_director','audio','text',
     CASE WHEN v_writing IS NULL THEN ARRAY[]::text[] ELSE ARRAY[v_writing] END,false));
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
 IF p_workflow IN ('visual','song_video','song_video_publish') THEN
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'visual_analysis','visual_analyst','visual','text',
     CASE WHEN v_audio IS NULL THEN ARRAY[]::text[] ELSE ARRAY[v_audio] END,false));
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


 IF p_workflow IN ('animation','animation_publish','song_video','song_video_publish') THEN
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'animation_storyboard','storyboarding_director','animation','text',
     CASE WHEN p_workflow IN ('song_video','song_video_publish') THEN ARRAY[v_visual,v_audio] ELSE ARRAY[]::text[] END,false));
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
 IF p_workflow IN ('idea_to_publish','idea_to_publish_audio') THEN
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
   IF p_workflow='idea_to_publish_audio' THEN
     v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
       'audio_direction','audio_director','audio','text',ARRAY['writing_review'],false));
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
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'story_storyboard','scene_storyboarder','visual','text',CASE WHEN v_audio IS NULL THEN ARRAY[v_prev] ELSE ARRAY['writing_review',v_audio] END,false));
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
   v_visual:=v_prev;
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'animation_storyboard','storyboarding_director','animation','text',
     CASE WHEN p_workflow='idea_to_publish_audio' THEN ARRAY[v_visual,v_audio] ELSE ARRAY[v_prev] END,false));
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
 -- Complete the optional existing-song or direct-video path by publishing.
 IF p_workflow IN ('song_video_publish','animation_publish') THEN
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'publish_plan','publish_planner','publish','text',ARRAY['release_audit'],false));
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'publish_send','publisher','publish','publish',ARRAY['publish_plan'],true));
   v_result:=v_result||jsonb_build_array(public.cbted_stage_record(
     'publish_verify','publish_verifier','publish','text',ARRAY['publish_send'],false));
 END IF;
 RETURN v_result;
END $function$
;
