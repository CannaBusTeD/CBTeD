\pset tuples_only on
\pset format unaligned
-- Every existing workflow (and every invalid input) must behave exactly as it did on 2026-11-18.
CREATE TEMP TABLE after_plans AS SELECT * FROM before_plans WITH NO DATA;
DO $$DECLARE b record; r text; BEGIN
 FOR b IN SELECT * FROM before_plans LOOP
   BEGIN r:=public.cbted_canonical_plan(b.workflow,b.img,b.vid)::text; EXCEPTION WHEN OTHERS THEN r:='ERROR: '||SQLERRM; END;
   INSERT INTO after_plans VALUES(b.workflow,b.img,b.vid,r);
 END LOOP; END$$;
SELECT 'P1 existing workflows changed: '||count(*) FROM before_plans b JOIN after_plans a USING(workflow,img,vid) WHERE b.workflow<>'idea_to_publish' AND a.result IS DISTINCT FROM b.result;
SELECT 'P2 idea_to_publish valid combinations: '||count(*) FILTER (WHERE result NOT LIKE 'ERROR%') FROM after_plans WHERE workflow='idea_to_publish';
SELECT 'P3 idea_to_publish rejections: '||string_agg(DISTINCT result,' | ' ORDER BY result) FROM after_plans WHERE workflow='idea_to_publish' AND result LIKE 'ERROR%';
-- The database's canonical plans must equal the JavaScript planner's plans.
SELECT 'P4 JS vs SQL mismatches: '||count(*) FILTER (WHERE public.cbted_canonical_plan(workflow,img,vid) IS DISTINCT FROM plan)||' of '||count(*) FROM expected_plans;
