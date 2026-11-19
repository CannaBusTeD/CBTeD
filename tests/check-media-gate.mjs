import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {webcrypto} from "node:crypto";
import {generationDecision,validGenerationSpec,QUOTE_MAX_AGE_MS} from "../supabase/functions/_shared/media-credit-policy.mjs";
const code=readFileSync(new URL("../supabase/functions/cbted-media-gate/index.ts",import.meta.url),"utf8");
const noImport=code.replace(/^import \{[^\n]+\} from "[^"]+";\s*/m,"");
const project="11111111-1111-4111-8111-111111111111";
const userId="22222222-2222-4222-8222-222222222222";
const fakeJob="33333333-3333-4333-8333-333333333333";
let serve,jobRecord=null,dbWrites=0,upstreamCalls=0;
const validUrl="https://testing.supabase.co";
async function fakeFetch(url,params={}){
 const u=new URL(String(url)),path=u.pathname,method=params.method||"GET";
 if(path==="/auth/v1/user")return new Response(JSON.stringify({id:userId}),{status:200});
 if(path.includes("/rest/v1/")){
  const table=path.split("/").pop();
  if(table==="projects")return new Response(JSON.stringify([{id:project,owner_id:userId,title:"Test"}]),{status:200});
  if(table==="cbted_media_jobs"){
   if(method==="POST"){dbWrites++;const body=JSON.parse(params.body);jobRecord={...body,id:fakeJob,created_at:new Date().toISOString()};return new Response(JSON.stringify([jobRecord]),{status:201});}
   if(method==="PATCH"){dbWrites++;Object.assign(jobRecord,JSON.parse(params.body));return new Response(JSON.stringify([jobRecord]),{status:200});}
   return new Response(JSON.stringify(jobRecord?[jobRecord]:[]),{status:200});
  }
  if(table==="cbted_media_job_events"){dbWrites++;return new Response(JSON.stringify([{id:"event"}]),{status:201});}
  if(table==="assets")return new Response("[]",{status:200});
  if(table==="production_runs")return new Response("[]",{status:200});
  if(table==="cbted_claim_media_job")return new Response(JSON.stringify({claimed:false,approval_required:true}),{status:200});
 }
 upstreamCalls++;throw Error("Unexpected provider request: "+url);
}
const sandbox={
 Deno:{env:{get(k){
  return {SUPABASE_URL:validUrl,SUPABASE_SERVICE_ROLE_KEY:"test-service-only",
   SUPABASE_PUBLISHABLE_KEY:"test-publishable-only"}[k]||null;
 }},serve(fn){serve=fn}},
 Request,Response,URL,URLSearchParams,TextEncoder,Uint8Array,crypto:webcrypto,
 AbortSignal,fetch:fakeFetch,atob,btoa,console,
 generationDecision,validGenerationSpec,QUOTE_MAX_AGE_MS
};
vm.runInNewContext(noImport,sandbox,{filename:"cbted-media-gate/index.ts"});
function call(path,body,auth=true){
 return serve(new Request(validUrl+"/functions/v1/cbted-media-gate/"+path,{
  method:"POST",headers:{...(auth?{Authorization:"Bearer signed-in-test-token"}:{}),"Content-Type":"application/json"},
  body:JSON.stringify(body)
 }));
}
test("anonymous media requests never touch the database",async()=>{
 const prior=dbWrites;
 const r=await call("prepare",{project_id:project,provider:"runway",kind:"image",prompt:"Cats and dogs"},false);
 assert.equal(r.status,401);assert.equal(dbWrites,prior);
});
test("unknown monthly credits force approval, no generation starts",async()=>{
 const r=await call("prepare",{project_id:project,provider:"runway",kind:"video",model:"gen-4.5",
  prompt:"Cats and dogs running",duration:10,estimated_credits:12});
 assert.equal(r.status,200);
 const d=await r.json();
 assert.equal(d.credit_decision.approvalRequired,true);
 assert.equal(d.job.status,"awaiting_approval");
 assert.equal(d.executed,false);
 assert.equal(upstreamCalls,0);
});
test("wrong amount is refused and precise creator approval is saved without spending",async()=>{
 const wrong=await call("approve",{job_id:fakeJob,decision:"approved",max_credits:1});
 assert.equal(wrong.status,400);
 assert.equal(jobRecord.status,"awaiting_approval");
 const ok=await call("approve",{job_id:fakeJob,decision:"approved",max_credits:12});
 assert.equal(ok.status,200);
 const d=await ok.json();
 assert.equal(d.status,"approved");assert.equal(d.spent,false);
 assert.equal(jobRecord.approved_max_credits,12);assert.equal(jobRecord.approved_fingerprint,jobRecord.quote_fingerprint);
 assert.equal(upstreamCalls,0);
});
test("submission before a real claimed operation fails",async()=>{
 const result=await call("submitted",{job_id:fakeJob,provider_job_id:"made-up-task"});
 assert.equal(result.status,400);assert.equal(jobRecord.status,"approved");
});
test("external URL import rejects unconfigured media hosts without fetching it",async()=>{
 jobRecord.status="submitted";jobRecord.provider_job_id="actual-task-id";
 const result=await call("import",{job_id:fakeJob,result_url:"https://metadata.google.internal/latest"});
 assert.equal(result.status,503);assert.equal(upstreamCalls,0);
});
test("native GPT image jobs use no external credit balance",async()=>{
 const r=await call("prepare",{project_id:project,provider:"chatgpt",kind:"image",prompt:"A grey tabby cat"});
 assert.equal(r.status,200);const d=await r.json();
 assert.equal(d.job.status,"ready");assert.equal(d.credit_decision.approvalRequired,false);
});
test("successful media output cannot be falsely marked complete without a real imported asset",async()=>{
 const r=await call("verify",{job_id:fakeJob,decision:"passed",review_note:"Looks brilliant in every scene"});
 assert.equal(r.status,400);
});
