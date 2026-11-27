import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {AGENTS,GATED_KINDS,buildPlan,authorisation,modelInstruction,parseImageSize,reviewPassed,effectiveProjectRules,projectRuleWindow} from "../supabase/functions/_shared/production.mjs";

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

test("idea to publish runs every stage in order: idea, writing, storyboard, images, motion, video, audit, publishing",()=>{
 const plan=buildPlan({workflow:"idea_to_publish",intent:"execute",image_count:2,video_count:2});
 const keys=plan.steps.map(s=>s.key);
 assert.deepEqual(keys,[
  "idea_develop","idea_critique","idea_refine",
  "writing_draft","writing_critique","writing_edit","writing_language_audit","writing_rewrite","writing_proofread","writing_review",
  "story_storyboard","visual_analysis","visual_select_tool",
  "visual_prompt_1","visual_generate_1","visual_review_1","visual_prompt_2","visual_generate_2","visual_review_2",
  "animation_storyboard","animation_motion_plan","animation_select_tool",
  "animation_generate_1","animation_review_1","animation_generate_2","animation_review_2","animation_assembly",
  "release_audit","publish_plan","publish_send","publish_verify"
 ]);
 const step=key=>plan.steps.find(s=>s.key===key);
 assert.equal(step("idea_develop").depends_on.length,0);
 assert.deepEqual(step("writing_draft").depends_on,["idea_refine"]);
 assert.equal(step("writing_draft").approval_required,true,"The creator approves the idea before writing starts");
 assert.deepEqual(step("story_storyboard").depends_on,["writing_review"]);
 assert.deepEqual(step("visual_analysis").depends_on,["story_storyboard"]);
 assert.deepEqual(step("animation_storyboard").depends_on,["visual_review_2"]);
 assert.ok(!keys.some(k=>k.startsWith("audio_")),"This workflow does not generate music");
 assert.deepEqual(step("publish_plan").depends_on,["release_audit"]);
 assert.equal(step("publish_send").kind,"publish");
 assert.equal(step("publish_send").approval_required,true);
 assert.equal(plan.steps.filter(s=>s.kind==="publish").length,1,"Exactly one public action");
 assert.equal(plan.steps.at(-1).key,"publish_verify");
});
test("existing workflows never gain idea or publishing stages",()=>{
 for(const workflow of ["writing","writing_critique","writing_suggestions","writing_line_edit","writing_rewrite","visual","animation","song_video"]){
  const keys=buildPlan({workflow,intent:"execute",image_count:2,video_count:2}).steps.map(s=>s.key);
  assert.ok(!keys.some(k=>k.startsWith("idea_")||k.startsWith("publish_")||k==="story_storyboard"),workflow);
 }
 assert.equal(buildPlan({workflow:"song_video"}).steps[0].key,"writing_draft");
 assert.equal(buildPlan({workflow:"song_video"}).steps[0].approval_required,false);
});
test("every media and publishing stage in every workflow needs its own approval",()=>{
 assert.deepEqual([...GATED_KINDS],["image","video","audio","publish"]);
 for(const workflow of ["writing","writing_critique","writing_suggestions","writing_line_edit","writing_rewrite","visual","animation","song_video","idea_to_publish"]){
  for(const s of buildPlan({workflow,intent:"execute",image_count:3,video_count:3}).steps){
   if(GATED_KINDS.includes(s.kind))assert.equal(s.approval_required,true,workflow+" "+s.key);
  }
 }
});
test("nothing is published without explicit approval, and revoking stops it",()=>{
 const plan=buildPlan({workflow:"idea_to_publish",intent:"execute"});
 const states=Object.fromEntries(plan.steps.map(s=>[s.key,"passed"]));
 states.publish_send="pending";states.publish_verify="pending";
 assert.match(authorisation({plan,step_key:"publish_send",states}).reason,/approval/);
 assert.equal(authorisation({plan,step_key:"publish_send",states,approvals:{publish_send:"revoked"}}).allowed,false);
 assert.equal(authorisation({plan,step_key:"publish_send",states,approvals:{publish_send:"approved"}}).allowed,true);
 assert.match(authorisation({plan,step_key:"publish_verify",states}).reason,/Dependency/);
 assert.equal(authorisation({plan:buildPlan({workflow:"idea_to_publish",intent:"plan"}),step_key:"publish_send",states,approvals:{publish_send:"approved"}}).allowed,false);
});
test("writing cannot start in idea to publish until the idea is approved",()=>{
 const plan=buildPlan({workflow:"idea_to_publish",intent:"execute"});
 const states={idea_develop:"passed",idea_critique:"passed",idea_refine:"passed"};
 assert.match(authorisation({plan,step_key:"writing_draft",states}).reason,/approval/);
 assert.equal(authorisation({plan,step_key:"writing_draft",states,approvals:{writing_draft:"approved"}}).allowed,true);
});
test("image size check accepts valid sizes and rejects bad ones",()=>{
 assert.deepEqual(parseImageSize("1536x864"),{width:1536,height:864});
 assert.deepEqual(parseImageSize("1024x1024"),{width:1024,height:1024});
 for(const bad of ["","abc","1536x865","4000x1000","3840x1000","x864","1536 x 864",undefined,null])
  assert.throws(()=>parseImageSize(bad),/WIDTHxHEIGHT/,String(bad));
});
test("a review passes only on an explicit PASS verdict",()=>{
 for(const ok of ["VERDICT: PASS","VERDICT: PASS\nAll checks met","\n  verdict:pass - fine"])assert.equal(reviewPassed(ok),true,ok);
 for(const no of ["VERDICT: REPAIR","**VERDICT: PASS**","VERDICT: PASSED","I think VERDICT: PASS","",null,undefined])assert.equal(reviewPassed(no),false,String(no));
});
test("orchestrator uses the shared checks and blocks unbuilt publishing",()=>{
 const src=readFileSync(new URL("../supabase/functions/cbted-orchestrator/index.ts",import.meta.url),"utf8");
 assert.match(src,/parseImageSize\(size\)/);
 assert.match(src,/reviewPassed\(result\.text\)/);
 assert.ok(!src.includes("\\\\d{3,4}")&&!src.includes("\\\\s*PASS"),"No over-escaped regular expressions");
 assert.match(src,/chosen\.kind==="publish"\|\|chosen\.agent==="publish_verifier"/);
 assert.match(src,/Only the publishing service can confirm a post/);
});


test("animation-only workflow accepts an idea and never mandates writing or still images",()=>{
 const plan=buildPlan({workflow:"animation",intent:"execute",video_count:2});
 assert.deepEqual([...new Set(plan.steps.map(s=>s.studio))],["animation","core"]);
 assert.ok(!plan.steps.some(s=>s.studio==="writing"||s.studio==="visual"||s.studio==="audio"));
 assert.deepEqual(plan.steps.filter(s=>s.agent==="video_generator").map(s=>s.key),["animation_generate_1","animation_generate_2"]);
 assert.equal(plan.steps.find(s=>s.key==="animation_generate_1").approval_required,true);
 assert.equal(plan.steps.find(s=>s.key==="animation_generate_2").approval_required,true);
});


test("only current rules enter agent context; exactly one prior revision is available for rollback",()=>{
 const rules=[
  {id:"r3",scope:"project",rule_key:"provider",supersedes_id:"r2",body:"current"},
  {id:"r2",scope:"visual",rule_key:"provider",supersedes_id:"r1",body:"obsolete second"},
  {id:"r1",scope:"visual",rule_key:"provider",body:"obsolete first"},
  {id:"independent",scope:"writing",rule_key:"provider",body:"independent"},
  {id:"other",scope:"project",rule_key:"voice",body:"keep"}
 ];
 assert.deepEqual(effectiveProjectRules(rules).map(r=>r.id),["r3","independent","other"]);
 assert.deepEqual(projectRuleWindow(rules).previous.map(r=>r.id),["r2"]);
 assert.equal(rules.length,5,"audit history must remain intact");
 assert.deepEqual(effectiveProjectRules([{id:"new",supersedes_id:"not-in-result"}]).map(r=>r.id),["new"]);
 assert.deepEqual(projectRuleWindow([]),{current:[],previous:[]});
});
test("orchestrator filters obsolete rules before agent prompts and provider settings",()=>{
 const src=readFileSync(new URL("../supabase/functions/cbted-orchestrator/index.ts",import.meta.url),"utf8");
 assert.ok(src.includes('const rules=effectiveProjectRules(await rest(token,"project_rules"'));
});
