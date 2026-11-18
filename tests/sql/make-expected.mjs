import {buildPlan} from "../../supabase/functions/_shared/production.mjs";
import {writeFileSync} from "node:fs";
const norm=p=>p.steps.map(s=>({key:s.key,agent:s.agent,studio:s.studio,kind:s.kind,depends_on:s.depends_on,approval_required:s.approval_required}));
let sql="CREATE TABLE expected_plans(workflow text,img int,vid int,plan jsonb);\n";
const rows=[];
for(let i=1;i<=20;i++)for(let v=1;v<=20;v++)rows.push(["idea_to_publish",i,v,norm(buildPlan({workflow:"idea_to_publish",image_count:i,video_count:v}))]);
// existing workflows too: JS and SQL must agree, using the SQL count convention (0 where not applicable)
const sqlCounts={writing:[0,0],writing_critique:[0,0],writing_suggestions:[0,0],writing_line_edit:[0,0],writing_rewrite:[0,0],visual:[null,0],animation:[0,null],song_video:[null,null]};
for(const [w,[ci,cv]] of Object.entries(sqlCounts))for(let i=1;i<=4;i++)for(let v=1;v<=4;v++){
  const plan=norm(buildPlan({workflow:w,image_count:i,video_count:v}));
  rows.push([w,ci??i,cv??v,plan]);
}
for(const [w,i,v,plan] of rows)sql+="INSERT INTO expected_plans VALUES ('"+w+"',"+i+","+v+",$j$"+JSON.stringify(plan)+"$j$::jsonb);\n";
sql+="CREATE TABLE test_inputs(name text primary key,steps jsonb);\n";
const inputs={idea_1_1:buildPlan({workflow:"idea_to_publish",intent:"execute",image_count:1,video_count:1}).steps,
 idea_2_2:buildPlan({workflow:"idea_to_publish",intent:"execute",image_count:2,video_count:2}).steps,
 visual_1:buildPlan({workflow:"visual",intent:"execute",image_count:1}).steps,
 song_video_1_1:buildPlan({workflow:"song_video",intent:"execute",image_count:1,video_count:1}).steps};
const p=buildPlan({workflow:"idea_to_publish",intent:"execute",image_count:1,video_count:1}).steps;
inputs.tamper_no_publish_approval=p.map(s=>s.key==="publish_send"?{...s,approval_required:false}:s);
inputs.tamper_no_idea_approval=p.map(s=>s.key==="writing_draft"?{...s,approval_required:false}:s);
inputs.tamper_skip_critique=p.filter(s=>s.key!=="idea_critique").map(s=>s.key==="idea_refine"?{...s,depends_on:["idea_develop"]}:s);
inputs.tamper_skip_publish_plan=p.filter(s=>s.key!=="publish_plan").map(s=>s.key==="publish_send"?{...s,depends_on:["release_audit"]}:s);
for(const [k,v] of Object.entries(inputs))sql+="INSERT INTO test_inputs VALUES ('"+k+"',$j$"+JSON.stringify(v)+"$j$::jsonb);\n";
writeFileSync(process.argv[2],sql);
console.log(rows.length,"expected plans,",Object.keys(inputs).length,"test inputs");
