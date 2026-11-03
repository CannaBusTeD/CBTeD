import test from "node:test";
import assert from "node:assert/strict";
import {routeTask} from "../core/task-router.mjs";
test("a single verse edit does not draft a new song or enter visual workflow",()=>{
 const p=routeTask({intent:"editorial",has_existing_source:true});
 assert.deepEqual(p.studios,["writing"]);
 assert.ok(!p.stages.some(x=>x.agent==="writing_author"||x.agent==="image_generator"));
});
test("critique only never rewrites",()=>{
 const p=routeTask({intent:"critique",has_existing_source:true});
 assert.deepEqual(p.stages.map(x=>x.agent),["writing_critic","language_auditor"]);
});
test("a new song runs its independent writing editorial gate",()=>{
 const p=routeTask({intent:"new_song"});
 assert.ok(p.stages.some(x=>x.agent==="writing_synthesizer"));
 assert.deepEqual(p.studios,["writing"]);
});
test("six images produce six distinct generations and checks",()=>{
 const p=routeTask({intent:"images",image_count:6});
 assert.equal(p.stages.filter(x=>x.agent==="image_generator").length,6);
 assert.equal(p.stages.filter(x=>x.agent==="image_reviewer").length,6);
 assert.deepEqual(p.studios,["visual"]);
});
test("existing song plus image goes straight to animation",()=>{
 const p=routeTask({intent:"video_from_assets",has_existing_source:true,has_image:true,has_audio:true,video_count:2});
 assert.deepEqual(p.studios,["animation"]);
 assert.equal(p.stages.filter(x=>x.agent==="video_generator").length,2);
 assert.ok(!p.stages.some(x=>["writing_author","image_generator"].includes(x.agent)));
});
test("an incomplete video input fails without inventing source",()=>{
 assert.throws(()=>routeTask({intent:"video_from_assets",has_existing_source:true}),/image/);
});
test("combined production explicitly activates all participating studios",()=>{
 const p=routeTask({intent:"complete",image_count:2,video_count:2});
 assert.deepEqual(p.studios,["writing","visual","audio","animation"]);
});
