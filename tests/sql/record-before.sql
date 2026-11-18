CREATE TABLE before_plans(workflow text,img int,vid int,result text);
DO $$DECLARE w text; i int; v int; r text; BEGIN
 FOREACH w IN ARRAY ARRAY['writing','writing_critique','writing_suggestions','writing_line_edit','writing_rewrite','visual','animation','song_video','idea_to_publish','bogus'] LOOP
  FOR i IN -1..21 LOOP FOR v IN -1..21 LOOP
   BEGIN r:=public.cbted_canonical_plan(w,i,v)::text; EXCEPTION WHEN OTHERS THEN r:='ERROR: '||SQLERRM; END;
   INSERT INTO before_plans VALUES(w,i,v,r);
  END LOOP; END LOOP;
 END LOOP;
END$$;
