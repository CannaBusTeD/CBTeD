import assert from "node:assert/strict";
import {test} from "node:test";
import {AGENTS,buildPlan,authorisation,modelInstruction} from "../supabase/functions/_shared/production.mjs";

test("explanation and planning cannot authorise generation",()=>{
  const plan=buildPlan({workflow:"visual",intent:"plan"});
  assert.equal(plan.steps.filter(s=>s.kind==="image").length,1);
  assert.equal(authorisation({plan,step_key:"visual_generate_1"}).allowed,false);
  assert.equal(buildPlan({workflow:"plan_only",intent:"execute"}).steps.length,0);
});
test("specialist stages preserve sequence and one-at-a-time media generation",()=>{
  const plan=buildPlan({workflow:"song_video",intent:"execute",image_count:3,video_count:2});
  assert.deepEqual(plan.steps.filter(s=>s.kind==="image").map(s=>s.key),["visual_generate_1","visual_generate_2","visual_generate_3"]);
  assert.deepEqual(plan.steps.filter(s=>s.kind==="video").map(s=>s.key),["animation_generate_1","animation_generate_2","animation_assembly"]);
  assert.ok(plan.steps.find(s=>s.key==="visual_generate_2").depends_on.includes("visual_prompt_2"));
  assert.ok(plan.steps.find(s=>s.key==="visual_prompt_2").depends_on.includes("visual_review_1"));
  assert.ok(plan.steps.find(s=>s.key==="animation_storyboard").depends_on.includes("audio_review"));
});
test("explicit approval and verified upstream stage are both required",()=>{
 const plan=buildPlan({workflow:"visual",intent:"execute"});
 assert.match(authorisation({plan,step_key:"visual_generate_1",states:{}}).reason,/Dependency/);
 const states={visual_analysis:"passed",visual_select_tool:"passed",visual_prompt_1:"passed"};
 assert.match(authorisation({plan,step_key:"visual_generate_1",states}).reason,/approval/);
 assert.equal(authorisation({plan,step_key:"visual_generate_1",states,approvals:{visual_generate_1:"revoked"}}).allowed,false);
 assert.equal(authorisation({plan,step_key:"visual_generate_1",states,approvals:{visual_generate_1:"approved"}}).allowed,true);
 assert.equal(authorisation({plan,step_key:"visual_generate_1",states,approvals:{visual_generate_1:"approved"},rules_changed:true}).allowed,false);
});
test("invalid counts and missing stages fail closed",()=>{
 assert.throws(()=>buildPlan({workflow:"visual",image_count:0}),/image_count/);
 assert.throws(()=>buildPlan({workflow:"visual",image_count:51}),/image_count/);
 assert.throws(()=>buildPlan({workflow:"wrong"}),/Unknown/);
 assert.equal(authorisation({plan:buildPlan({workflow:"writing",intent:"execute"}),step_key:"visual_generate_1"}).allowed,false);
});
test("agents never infer AI authorship and instructions carry source",()=>{
 assert.match(AGENTS.language_auditor.role,/Never claim authorship detection is conclusive/);
 const step=buildPlan({workflow:"writing"}).steps[0];
 const prompt=modelInstruction(step,"full rules","avoid X","MY ORIGINAL","none","Critique only");
 assert.match(prompt,/MY ORIGINAL/);
 assert.match(prompt,/Do ONLY the task/);
});

test("each existing-song writing intent has a sealed independent production plan",()=>{
 const expected={
  writing_critique:["writing_critic","language_auditor","writing_reviewer"],
  writing_suggestions:["writing_critic","language_auditor","writing_editor","writing_reviewer"],
  writing_line_edit:["writing_editor","language_auditor","writing_reviewer"],
  writing_rewrite:["writing_critic","writing_editor","language_auditor","writing_synthesizer","writing_proofreader","writing_reviewer"]
 };
 for(const [workflow,agents] of Object.entries(expected)){
  const plan=buildPlan({workflow,intent:"execute"});
  assert.deepEqual(plan.steps.map(x=>x.agent),agents);
  assert.ok(plan.steps.every(x=>x.studio==="writing"&&x.kind==="text"));
  assert.ok(plan.steps.every((x,i)=>i===0?x.depends_on.length===0:x.depends_on.includes(plan.steps[i-1].key)));
 }
});
test("critique and suggestions never generate or rewrite full lyrics",()=>{
 for(const workflow of ["writing_critique","writing_suggestions"]){
  const agents=buildPlan({workflow}).steps.map(x=>x.agent);
  assert.ok(!agents.includes("writing_synthesizer"));
  assert.ok(!agents.includes("writing_author"));
 }
});
test("full editorial rewriting ends with independent reviewer, not an automatic PASS",()=>{
 const plan=buildPlan({workflow:"writing_rewrite",intent:"execute"});
 const last=plan.steps.at(-1);
 assert.equal(last.agent,"writing_reviewer");
 assert.equal(authorisation({plan,step_key:last.key}).allowed,false);
});
