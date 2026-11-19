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
 assert.throws(()=>routeGeneration({provider:"chatgpt",kind:"video"}),/cannot produce/);
 assert.throws(()=>routeGeneration({provider:"imaginary",kind:"image"}),/connected/);
});

test("Suno songs and ElevenLabs voice use real connected tools",()=>{
 const song=routeGeneration({provider:"suno",kind:"audio",audio_type:"music"});
 assert.equal(song.tool_action,"mcp__Suno__audio_create");
 assert.equal(song.check.check_allowance,"mcp__Suno__account_usage");
 const narration=routeGeneration({provider:"elevenlabs",kind:"audio",audio_type:"narration"});
 assert.equal(narration.tool_action,"mcp__ElevenLabs__creative_generate_speech");
 assert.throws(()=>routeGeneration({provider:"elevenlabs",kind:"audio",audio_type:"music"}),/Suno/);
});
test("Runway offers music and narration without a false video stage",()=>{
 assert.equal(routeGeneration({provider:"runway",kind:"audio",audio_type:"music"}).tool_action,"mcp__Runway__generate_music");
 assert.equal(routeGeneration({provider:"runway",kind:"audio",audio_type:"narration"}).tool_action,"mcp__Runway__generate_speech");
});
