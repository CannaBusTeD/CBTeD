import {test} from "node:test";
import assert from "node:assert/strict";
import {generationDecision,validGenerationSpec,QUOTE_MAX_AGE_MS} from "../supabase/functions/_shared/media-credit-policy.mjs";
const now=Date.parse("2026-11-19T10:00:00Z");
const fresh=new Date(now-10000).toISOString();
const base={provider:"runway",estimatedCredits:100,includedRemaining:125,remainingSource:"provider_tool",observedAt:fresh,now};
test("native ChatGPT imagery does not claim external credits",()=>{
 assert.equal(generationDecision({provider:"chatgpt",billingMode:"native"}).status,"ready");
 assert.throws(()=>generationDecision({provider:"chatgpt",billingMode:"credits"}),/native/);
});
test("verified provider-included credit quote proceeds while within allowance",()=>{
 const d=generationDecision(base);
 assert.equal(d.status,"ready");assert.equal(d.overageCredits,0);
});
test("purchased credits are never confused with included credits",()=>{
 const d=generationDecision({...base,includedRemaining:0,purchasedRemaining:1000});
 assert.equal(d.status,"awaiting_approval");
 assert.equal(d.overageCredits,100);
});
test("unknown credit origin, unknown quote, stale observations all fail closed",()=>{
 for(const patch of [
  {remainingSource:"user_entered"},{includedRemaining:null},{observedAt:new Date(now-QUOTE_MAX_AGE_MS-1).toISOString()},
  {observedAt:null},{estimatedCredits:null}
 ]){
  const d=generationDecision({...base,...patch});
  assert.notEqual(d.status,"ready");
  assert.equal(d.approvalRequired,true);
 }
});
test("reserved in-flight included credits are not double spent",()=>{
 const d=generationDecision({...base,reservedCredits:40});
 assert.equal(d.status,"awaiting_approval");assert.equal(d.overageCredits,15);
});
test("free provider credits require explicit fresh supported entitlement",()=>{
 const d=generationDecision({...base,billingMode:"free_generation",estimatedCredits:0});
 assert.equal(d.status,"ready");
 assert.equal(generationDecision({...base,billingMode:"free_generation",estimatedCredits:0,remainingSource:"unknown"}).status,"awaiting_approval");
});
test("quotes and creative jobs reject invalid input",()=>{
 assert.equal(validGenerationSpec({provider:"higgsfield",kind:"image",prompt:"Cats with dogs"}),true);
 for(const patch of [{provider:"rogue"},{kind:"unknown"},{prompt:""},{model:12},{aspect_ratio:"bad"},{estimated_credits:-2},{duration:300}]){
  assert.throws(()=>validGenerationSpec({provider:"higgsfield",kind:"video",prompt:"Cats and dogs",...patch}));
 }
});
