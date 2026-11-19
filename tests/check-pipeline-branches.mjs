import test from "node:test";
import assert from "node:assert/strict";
import {buildPlan,authorisation} from "../supabase/functions/_shared/production.mjs";
const make=workflow=>buildPlan({workflow,intent:"execute",image_count:1,video_count:1});
test("independent audio needs no forced writing, images or video",()=>{
 const p=make("audio");assert.deepEqual(p.steps.map(x=>x.key),["audio_direction","audio_select_tool","audio_generate","audio_review"]);
 assert.deepEqual(p.steps[0].depends_on,[]);
 assert.equal(p.steps.find(x=>x.key==="audio_generate").approval_required,true);
});
test("direct idea-to-video can reach publishing without forcing stills or music",()=>{
 const p=make("animation_publish");
 assert.ok(p.steps.find(x=>x.key==="publish_send"));
 assert.ok(!p.steps.some(x=>x.kind==="image"||x.studio==="writing"||x.studio==="audio"));
 assert.deepEqual(p.steps.find(x=>x.key==="publish_plan").depends_on,["release_audit"]);
});
test("song video with music and socials has all necessary branches",()=>{
 const p=make("song_video_publish");
 for(const key of ["writing_review","visual_review_1","audio_generate","audio_review","animation_assembly","release_audit","publish_send","publish_verify"])
  assert.ok(p.steps.some(x=>x.key===key),"Missing "+key);
 assert.deepEqual(p.steps.find(x=>x.key==="animation_storyboard").depends_on,["visual_review_1","audio_review"]);
});
test("idea to publication WITH music adds a real audio dependency",()=>{
 const p=make("idea_to_publish_audio");
 for(const key of ["idea_refine","writing_review","story_storyboard","visual_generate_1","audio_generate","audio_review","animation_generate_1","animation_assembly","publish_send"])
  assert.ok(p.steps.some(x=>x.key===key),"Missing "+key);
 assert.deepEqual(p.steps.find(x=>x.key==="animation_storyboard").depends_on,["visual_review_1","audio_review"]);
 assert.equal(p.steps.find(x=>x.key==="publish_send").approval_required,true);
});
test("legacy idea-to-publish remains unchanged; song_video remains private",()=>{
 assert.ok(!make("idea_to_publish").steps.some(x=>x.studio==="audio"));
 assert.ok(!make("song_video").steps.some(x=>x.studio==="publish"));
});
test("publishing cannot start until assembled video and creator approval pass",()=>{
 const p=make("animation_publish");
 const steps=Object.fromEntries(p.steps.map(x=>[x.key,"pending"]));
 const r=authorisation({plan:p,step_key:"publish_send",states:steps,approvals:{}});
 assert.equal(r.allowed,false);
 assert.match(r.reason,/Dependency incomplete/);
});
