import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, webcrypto } from "node:crypto";
import vm from "node:vm";

const source = readFileSync(new URL("../supabase/functions/cbted-media-gate/index.ts",import.meta.url),"utf8").replace(/^import .*;$/gm,"");
const origin="https://example.supabase.co";
const id = n => ("0000000"+n).slice(-8)+"-0000-4000-8000-000000000000";
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO1kAAAAASUVORK5CYII=","base64");
const hash=createHash("sha256").update(png).digest("hex");

function fixture(){
 let handler, asset, stored, imports=0;
 const job={id:id(1),owner_id:id(2),project_id:id(3),run_id:id(4),step_key:"visual_generate_1",status:"claimed",claimed_at:"today",kind:"image",provider:"chatgpt",billing_mode:"native",quote_credits:0,approval_required:false};
 const stage={kind:"image",status:"in_progress"};
 const response=value=>Response.json(value);
 const fetch=async (address,init={})=>{
  const url=new URL(address),path=url.pathname, method=init.method||"GET";
  if(path==="/auth/v1/user")return response({id:id(2)});
  if(path==="/rest/v1/projects")return response(url.searchParams.get("id")==="eq."+job.project_id?[{}]:[]);
  if(path==="/rest/v1/production_steps")return response([stage]);
  if(path==="/rest/v1/cbted_media_jobs"){
   const matches=[...url.searchParams].filter(([k])=>!["limit","select"].includes(k)).every(([k,v])=>v==="is.null"?job[k]==null:v==="eq."+job[k]);
   if(!matches)return response([]);
   if(method==="PATCH")Object.assign(job,JSON.parse(init.body));
   return response([job]);
  }
  if(path==="/rest/v1/cbted_media_job_events"){
   if(JSON.parse(init.body).event==="imported")imports++;
   return response([]);
  }
  if(path==="/rest/v1/assets"){
   if(method==="POST")asset=JSON.parse(init.body);
   return response(asset?[asset]:[]);
  }
  if(path.startsWith("/storage/v1/object/")){
   if(method==="POST"){assert.equal(init.headers["x-upsert"],"false");assert.equal(stored,undefined);stored=init.body;}
   return new Response(stored);
  }
  throw Error("Unexpected request "+path);
 };
 vm.runInNewContext(source,{Deno:{env:{get:key=>({SUPABASE_URL:origin,SUPABASE_SERVICE_ROLE_KEY:"test",SUPABASE_PUBLISHABLE_KEY:"pub"}[key])},serve:f=>handler=f},fetch,crypto:webcrypto,URL,URLSearchParams,Uint8Array,TextEncoder,Request,Response,AbortSignal,atob,btoa});
 const call=(url,body,auth="Bearer fixture",type="application/json")=>handler(new Request(url,{method:"POST",headers:{authorization:auth,"content-type":type},body}));
 const submit=()=>call(origin+"/submitted",JSON.stringify({job_id:job.id,provider_job_id:"native-png-sha256:"+hash}));
 return {job,stage,submit,call,imports:()=>imports};
}
test("native worker can import only its signed bytes and exact existing job, and replays preserve one private result",async()=>{
 const f=fixture();
 const {private_png_upload:g}=await (await f.submit()).json();
 assert.ok(g.authorization);
 const post=(url,bytes,token=g.authorization)=>f.call(url,bytes,token,"image/png");
 assert.equal((await post(g.url.replace(id(4),id(8)),png)).status,400);
 assert.equal((await post(g.url,png.subarray(1))).status,400);
 const different=Buffer.from(png);different[23]^=1;
 assert.equal((await post(g.url,different)).status,400);
 assert.equal(f.imports(),0);
 for(let i=0;i<2;i++){
  const r=await post(g.url,png);assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{job_id:id(1),asset_id:id(1),status:"needs_review",bytes:png.length,sha256:hash,private_bytes_verified:true});
 }
 assert.equal(f.imports(),1);
 assert.equal(f.stage.status,"in_progress");
});
test("unclaimed stages and nonzero jobs cannot obtain a native file grant",async()=>{
 const f=fixture();f.job.quote_credits=1;
 assert.equal((await f.submit()).status,400);
 f.job.quote_credits=0;f.stage.status="pending";
 assert.equal((await f.submit()).status,400);
 assert.equal(f.job.status,"claimed");assert.equal(f.imports(),0);
});
