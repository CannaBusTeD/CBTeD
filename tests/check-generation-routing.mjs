import {test} from "node:test";
import assert from "node:assert/strict";
import {routeGeneration} from "../core/generation-routing.mjs";
test("GPT images stay in ChatGPT without external credits",()=>{
 const d=routeGeneration({provider:"chatgpt",kind:"image"});
 assert.equal(d.tool_action,"image_gen.text2im");
 assert.equal(d.credit_gate,"native");
 assert.equal(d.executed,false);
});
test("Runway direct video from idea bypasses image generation",()=>{
 const r=routeGeneration({provider:"runway",kind:"video",has_source_image:false});
 assert.equal(r.tool_action,"mcp__Runway__generate_video");
 assert.equal(r.input_mode,"text_prompt");
 assert.match(r.check.quote,/No universal direct quote/);
});
test("Higgsfield approved image can become a new video",()=>{
 const r=routeGeneration({provider:"higgsfield",kind:"video",has_source_image:true});
 assert.equal(r.tool_action,"mcp__Higgsfield__generate_video");
 assert.equal(r.check.quote,"mcp__Higgsfield__estimate_video_cost");
 assert.equal(r.input_mode,"image_reference");
});
test("Unknown providers and unsupported GPT-native video never silently substitute engines",()=>{
 assert.throws(()=>routeGeneration({provider:"chatgpt",kind:"video"}),/choose Runway or Higgsfield/);
 assert.throws(()=>routeGeneration({provider:"imaginary",kind:"image"}),/connected/);
});
