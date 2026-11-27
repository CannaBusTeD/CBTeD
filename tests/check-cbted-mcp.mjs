import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {projectRuleWindow} from "../supabase/functions/_shared/production.mjs";

const root = "../supabase/functions/cbted-mcp/";
const moduleText=readFileSync(new URL(root+"index.ts",import.meta.url),"utf8");
const docs=Array.from({length:9},(_,i)=>{
 const text=readFileSync(new URL(root+"rule-"+(i+1)+".ts",import.meta.url),"utf8");
 return JSON.parse(text.replace(/^export const document = /,"").trim().replace(/;$/,""));
});
const rulebook=Object.fromEntries(docs.map(x=>[x.path,{sha:x.sha,content:x.content}]));
const source=moduleText.replace('import {RULEBOOK} from "./rulebook.ts";',"const RULEBOOK = "+JSON.stringify(rulebook)+";").replace('import {projectRuleWindow} from "../_shared/production.mjs";',projectRuleWindow.toString());
assert.match(source, /CBTeD ChatGPT MCP bridge/);
const projectRef = "dmzzyfiwtosxtyekpbfi";
const base = "https://" + projectRef + ".supabase.co/functions/v1/cbted-mcp";
const testUser = "00000000-0000-4000-8000-000000000001";
let handler;
let networkCalls=0;
let authenticated=false;
const fakeFetch=async(url,options={})=>{
  networkCalls+=1;
  const uri=String(url);
  if(uri.endsWith("/auth/v1/user")){
    return authenticated
      ? new Response(JSON.stringify({id:testUser,email:"tester@example.test"}),{status:200})
      : new Response(JSON.stringify({error:"unauthorized"}),{status:401});
  }
  if(uri.includes("/functions/v1/cbted-media-gate/jobs")){
    return new Response(JSON.stringify({jobs:[]}),{status:200});
  }
  if(uri.includes("/functions/v1/cbted-social-connect/status")){
    return new Response(JSON.stringify({available:false,providers:{youtube:false,facebook:false,instagram:false,tiktok:false,x:false},connections:[],post_requests:[]}),{status:200});
  }
  if(uri.includes("/functions/v1/cbted-external-review")){
    const body=JSON.parse(options.body||"{}");
    if(body.action==="list")return new Response(JSON.stringify({reviews:[]}),{status:200});
    return new Response(JSON.stringify({error:"Mock denies unplanned review write"}),{status:403});
  }
  if(uri.includes("/rest/v1/projects?")){
    return new Response(JSON.stringify([{id:"00000000-0000-4000-8000-000000000002",owner_id:testUser,title:"Test Project",status:"active"}]),{status:200});
  }
  if(uri.includes("/rest/v1/project_rules?")){
    return new Response(JSON.stringify([{id:"r3",supersedes_id:"r2",body:"current"},{id:"r2",supersedes_id:"r1",body:"rollback"},{id:"r1",body:"obsolete"},{id:"other",body:"independent"}]),{status:200});
  }
  if(uri.includes("/rest/v1/"))return new Response("[]",{status:200});
  throw Error("Unexpected network call to "+uri);
};
const sandbox={
  Deno:{env:{get(key){
    if(key==="SUPABASE_URL")return "https://"+projectRef+".supabase.co";
    if(key==="SUPABASE_PUBLISHABLE_KEYS")return JSON.stringify({default:"sb_publishable_test_only"});
    return null;
  }},serve(fn){handler=fn;}},
  Request,Response,URL,URLSearchParams,fetch:fakeFetch,console
};
vm.runInNewContext(source,sandbox,{filename:"cbted-mcp/index.ts"});
assert.equal(typeof handler,"function","Deno must register an HTTP handler");
const rpc=async(method,params={},auth=false)=>{
  const req=new Request(base,{method:"POST",headers:{"Content-Type":"application/json",...(auth?{Authorization:"Bearer mocked-test-token"}:{})},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});
  const result=await handler(req);
  assert.equal(result.status,200,"MCP RPC should return JSON");
  return result.json();
};
const health=await (await handler(new Request(base))).json();
assert.equal(health.status,"online");
assert.equal(health.rule_documents,9);
const meta=await(await handler(new Request(base+"/.well-known/oauth-protected-resource"))).json();
assert.equal(meta.resource,base);
assert.equal(meta.authorization_servers[0],"https://"+projectRef+".supabase.co/auth/v1");
const rawInit=(auth)=>handler(new Request(base,{method:"POST",headers:{"Content-Type":"application/json",...(auth?{Authorization:"Bearer "+auth}:{})},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2025-06-18"}})}));
// Standard MCP authorization: connecting without a sign-in gets 401 + WWW-Authenticate so the client starts OAuth.
const anonInit=await rawInit(null);
assert.equal(anonInit.status,401,"An unauthenticated MCP connection must be refused so the client signs in");
assert.equal(anonInit.headers.get("WWW-Authenticate"),'Bearer resource_metadata="'+base+'/.well-known/oauth-protected-resource", error="invalid_token", error_description="Connect your CBTeD account to access private projects"');
assert.equal((await anonInit.json()).error,"invalid_token");
assert.equal(networkCalls,0,"Refusing a missing token must not call any API");
const list=await rpc("tools/list");
assert.ok(list.result.tools.length>=12,"Expected full CBTeD studio/project tools");
const names=list.result.tools.map(t=>t.name);
for(const expected of ["cbted_get_rulebook","cbted_list_projects","cbted_get_project_context","cbted_route_task","cbted_plan_production","cbted_get_asset_link"]){
  assert.ok(names.includes(expected),expected+" missing");
}
assert.ok(list.result.tools.find(t=>t.name==="cbted_get_rulebook").securitySchemes.some(s=>s.type==="noauth"));
assert.ok(list.result.tools.find(t=>t.name==="cbted_list_projects").securitySchemes.some(s=>s.type==="oauth2"));
const rules=await rpc("tools/call",{name:"cbted_get_rulebook",arguments:{studio:"visual"}});
assert.equal(rules.result.isError,false);
const payload=JSON.parse(rules.result.content[0].text);
assert.equal(payload.documents.length,4);
assert.match(payload.documents[0].content,/Source first/);
assert.match(payload.documents[2].content,/Image Generation Workflow/);
const writingRules=await rpc("tools/call",{name:"cbted_get_rulebook",arguments:{studio:"writing"}});
assert.equal(writingRules.result.isError,false);
const lyricPayload=JSON.parse(writingRules.result.content[0].text);
assert.equal(lyricPayload.documents.length,3,"Writing rules must load core, writing and lyric master");
const gate=lyricPayload.documents.find(d=>d.path==="writing/Writing_Studio.md");
assert.ok(gate,"Dedicated editorial gate must be present");
const editorialGate = gate.content.split("Full-song editorial gate")[1]?.split("Prose and fiction")[0];
assert.ok(editorialGate, "Full-song editorial gate must be present");
let previousPhase = -1;
for (const phase of ["Critique.", "Recommendations.", "Rewrite.", "Review the complete manuscript", "writer and reviewer jointly select"]) {
  const position = editorialGate.indexOf(phase);
  assert.ok(position > previousPhase, "Missing or out-of-order editorial stage: " + phase);
  previousPhase = position;
}
assert.match(editorialGate, /Three is the maximum\./);
assert.equal(networkCalls,0,"Reading public bundled rules must not access private APIs");
const blocked=await rpc("tools/call",{name:"cbted_list_projects",arguments:{}});
assert.equal(blocked.result.isError,true);
assert.ok(blocked.result._meta["mcp/www_authenticate"],"No token must trigger OAuth");
assert.equal(networkCalls,0,"Missing token must never read the database");
const expiredInit=await rawInit("expired-or-revoked-token");
assert.equal(expiredInit.status,401,"An expired or invalid token must be refused so the client refreshes or signs in again");
assert.match(expiredInit.headers.get("WWW-Authenticate")||"",/^Bearer resource_metadata="/);
authenticated=true;
const init=await rpc("initialize",{protocolVersion:"2025-06-18"},true);
assert.equal(init.result.serverInfo.name,"CBTeD","A signed-in client connects normally");
const projects=await rpc("tools/call",{name:"cbted_list_projects",arguments:{}},true);
assert.equal(projects.result.isError,false);
assert.equal(JSON.parse(projects.result.content[0].text).projects[0].title,"Test Project");
assert.ok(networkCalls>=2,"Authenticated call verifies the user then reads with a delegated bearer");
const notification=await handler(new Request(base,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",method:"notifications/initialized"})}));
assert.equal(notification.status,202);
console.log("CBTeD MCP protocol/auth/rules smoke tests passed ("+list.result.tools.length+" tools).");

for(const expected of ["cbted_social_suggest_accounts","cbted_social_connection_status","cbted_social_begin_authorisation","cbted_social_confirm_account","cbted_social_disconnect","cbted_social_create_post_draft","cbted_social_approve_post"]){
 assert.ok(names.includes(expected),"Missing social plugin action: "+expected);
 assert.ok(list.result.tools.find(t=>t.name===expected).securitySchemes.some(s=>s.type==="oauth2"),"Social action must require OAuth: "+expected);
}
const unauthSocial=await rpc("tools/call",{name:"cbted_social_connection_status",arguments:{}});
assert.equal(unauthSocial.result.isError,true,"Anonymous clients cannot see social connections");
const socialList=await rpc("tools/call",{name:"cbted_social_connection_status",arguments:{}},true);
assert.equal(socialList.result.isError,false);
const socialStatus=JSON.parse(socialList.result.content[0].text);
assert.equal(socialStatus.available,false);
assert.deepEqual(socialStatus.connections,[]);
const guess=await rpc("tools/call",{name:"cbted_social_suggest_accounts",arguments:{username:"CannaBusTeD"}},true);
assert.equal(guess.result.isError,false);
const suggested=JSON.parse(guess.result.content[0].text);
assert.equal(suggested.verified,false);
assert.equal(suggested.profiles.length,5);
assert.equal(suggested.profiles[4].provider,"x");
const pasted=await rpc("tools/call",{name:"cbted_social_suggest_accounts",arguments:{username:"https://www.facebook.com/CannaBusTeD"}},true);
assert.equal(pasted.result.isError,false);
const suggestedFromLink=JSON.parse(pasted.result.content[0].text);
assert.equal(suggestedFromLink.identified_provider,"facebook");
assert.equal(suggestedFromLink.profiles.find(x=>x.provider==="facebook").url,"https://www.facebook.com/CannaBusTeD");
const spoofed=await rpc("tools/call",{name:"cbted_social_suggest_accounts",arguments:{username:"https://www.facebook.com.bad.example/Someone"}},true);
assert.equal(spoofed.result.isError,true);
for(const name of ["cbted_media_jobs","cbted_media_prepare","cbted_media_quote","cbted_media_approve",
 "cbted_media_claim","cbted_media_submitted","cbted_media_reference","cbted_media_import","cbted_media_verify"]){
 assert.ok(names.includes(name),"Missing CBTeD media handoff action: "+name);
 assert.ok(list.result.tools.find(t=>t.name===name).securitySchemes.some(x=>x.type==="oauth2"),"Media actions need account authentication");
}
const mediaAnonymous=await rpc("tools/call",{name:"cbted_media_jobs",arguments:{project_id:"11111111-1111-4111-8111-111111111111"}});
assert.equal(mediaAnonymous.result.isError,true);
const mediaJobs=await rpc("tools/call",{name:"cbted_media_jobs",arguments:{project_id:"11111111-1111-4111-8111-111111111111"}},true);
assert.equal(mediaJobs.result.isError,false);
assert.deepEqual(JSON.parse(mediaJobs.result.content[0].text).jobs,[]);
assert.ok(!names.includes("cbted_create_task")&&!names.includes("cbted_record_output"),"Legacy task APIs must not bypass the production controller");
for(const mode of ["critique","suggestions","rewrite"]){
 const response=await rpc("tools/call",{name:"cbted_route_task",arguments:{intent:mode,has_existing_source:true}},true);
 const result=JSON.parse(response.result.content[0].text);
 assert.equal(result.studios.length,1);
 assert.equal(result.studios[0],"writing");
 if(mode!=="rewrite")assert.ok(!result.stages.some(x=>x.agent==="writing_synthesizer"));
}

const prodTool=list.result.tools.find(t=>t.name==="cbted_plan_production");
for(const mode of ["writing_critique","writing_suggestions","writing_line_edit","writing_rewrite","idea_to_publish"]){
 assert.ok(prodTool.inputSchema.properties.workflow.enum.includes(mode),"MCP must expose workflow "+mode);
}
assert.ok(lyricPayload.documents.some(d=>d.path==="writing/Lyric_Master.md"));
assert.match(gate.content,/client explicitly asks for a full rewrite/);

for(const required of ["cbted_review_create","cbted_review_list","cbted_review_approve","cbted_review_reviewers","cbted_review_add_reviewer","cbted_review_approve_reviewer","cbted_review_invite","cbted_review_feedback","cbted_review_revoke","cbted_review_complete","cbted_1f916_front"]){
  assert.ok(names.includes(required),required+" must be in MCP tool list");
  assert.ok(list.result.tools.find(t=>t.name===required).securitySchemes.some(s=>s.type==="oauth2"),required+" must require OAuth");
}
const beforePrivate=networkCalls;
const missingAuth=await rpc("tools/call",{name:"cbted_review_list",arguments:{project_id:"00000000-0000-4000-8000-000000000002"}},false);
assert.equal(missingAuth.result.isError,true);
assert.equal(networkCalls,beforePrivate,"Unauthenticated review call must not contact backend");
const permittedReview=await rpc("tools/call",{name:"cbted_review_list",arguments:{project_id:"00000000-0000-4000-8000-000000000002"}},true);
assert.equal(permittedReview.result.isError,false);
assert.deepEqual(JSON.parse(permittedReview.result.content[0].text).reviews,[]);
const deniedApproval=await rpc("tools/call",{name:"cbted_review_approve",arguments:{review_id:"00000000-0000-4000-8000-000000000010"}},true);
assert.equal(deniedApproval.result.isError,true,"Review backend denial must not be ignored");
console.log("External review MCP authentication and denial tests passed.");

const directRoute=await rpc("tools/call",{name:"cbted_route_task",arguments:{intent:"video_from_idea",previous_intent:"images",has_existing_source:false,has_image:false,video_count:2}},true);
assert.equal(directRoute.result.isError,false,"An idea must route to video without existing assets");
const directPlan=JSON.parse(directRoute.result.content[0].text);
assert.deepEqual(directPlan.studios,["animation"]);
assert.equal(directPlan.previous_intent,"images");
assert.equal(directPlan.direction_changed,true);
assert.equal(directPlan.generation_started,false);
assert.equal(directPlan.stages.filter(x=>x.agent==="video_generator").length,2);
assert.ok(!directPlan.stages.some(x=>x.studio==="writing"||x.studio==="visual"||x.studio==="audio"));
const stillRequired=await rpc("tools/call",{name:"cbted_route_task",arguments:{intent:"video_from_assets",has_existing_source:true,has_image:false}},true);
assert.equal(stillRequired.result.isError,true,"Image-to-video must still require its source image");

const contextArgs={project_id:"00000000-0000-4000-8000-000000000002"};
const workingContext=await rpc("tools/call",{name:"cbted_get_project_context",arguments:contextArgs},true);
assert.equal(workingContext.result.isError,false);
const working=JSON.parse(workingContext.result.content[0].text);
assert.deepEqual(working.rules.map(r=>r.id),["r3","other"]);
assert.equal(working.previous_rules,undefined);
const rollbackContext=await rpc("tools/call",{name:"cbted_get_project_context",arguments:{...contextArgs,include_previous_rules:true}},true);
assert.equal(rollbackContext.result.isError,false);
const rollback=JSON.parse(rollbackContext.result.content[0].text);
assert.deepEqual(rollback.rules.map(r=>r.id),["r3","other"]);
assert.deepEqual(rollback.previous_rules.map(r=>r.id),["r2"]);
console.log("Current rules and single rollback revision MCP isolation passed.");
