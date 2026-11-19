// CBTeD Media Credit Gate. Supabase is the account/project store, never a replacement
// for the connected Runway or Higgsfield creative tools available inside ChatGPT.
// Quote -> credit decision -> specific approval -> atomic claim -> provider submission
// -> private media import -> creative review. Never spend credits here.
import {generationDecision,validGenerationSpec,QUOTE_MAX_AGE_MS} from "../_shared/media-credit-policy.mjs";
const ROOT=(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const PUB=(()=>{const v=Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||Deno.env.get("SUPABASE_ANON_KEY");if(v)return v;try{return JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default||""}catch{return ""}})();
const BUCKET="cbted-project-assets";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const COMMON={"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*","access-control-allow-headers":"authorization,apikey,content-type","access-control-allow-methods":"GET,POST,OPTIONS"};
const VALID_TABLES=new Set(["projects","assets","production_runs","cbted_media_jobs","cbted_media_job_events"]);
function result(data,status=200){return new Response(JSON.stringify(data),{status,headers:COMMON});}
const requiredId=(x,label)=>{if(!UUID.test(String(x||"")))throw Error("Invalid "+label);return x;};
const number=x=>typeof x==="number"&&Number.isFinite(x)&&x>=0;
function environment(){if(!ROOT||!SERVICE||!PUB)throw Error("CBTeD media controller is not configured");}
async function currentUser(req){
 environment();
 const match=/^Bearer ([^\s]+)$/.exec(req.headers.get("Authorization")||"");
 if(!match)throw Error("Sign in to CBTeD first");
 const res=await fetch(ROOT+"/auth/v1/user",{headers:{apikey:PUB,Authorization:"Bearer "+match[1]}});
 if(!res.ok)throw Error("CBTeD session expired");
 const u=await res.json();
 return {id:requiredId(u.id,"account"),token:match[1]};
}
async function db(table,method="GET",query={},body,prefer="return=representation"){
 environment();if(!VALID_TABLES.has(table))throw Error("Unsupported table");
 const qs=new URLSearchParams(query).toString();
 const r=await fetch(ROOT+"/rest/v1/"+table+(qs?"?"+qs:""),{
  method,headers:{apikey:SERVICE,Authorization:"Bearer "+SERVICE,"content-type":"application/json",Prefer:prefer},
  ...(body===undefined?{}:{body:JSON.stringify(body)})
 });
 const text=await r.text();let data;try{data=text?JSON.parse(text):null}catch{throw Error("CBTeD database response invalid")}
 if(!r.ok)throw Error("CBTeD database rejected request ("+r.status+")");
 return data;
}
async function ownedProject(user,projectId){
 requiredId(projectId,"project");
 const rows=await db("projects","GET",{id:"eq."+projectId,owner_id:"eq."+user,select:"id,title",limit:"1"});
 if(rows?.length!==1)throw Error("Project not found or not owned by this account");
 return rows[0];
}
async function ownedAsset(projectId,assetId,kind){
 requiredId(assetId,"asset");
 const rows=await db("assets","GET",{id:"eq."+assetId,project_id:"eq."+projectId,limit:"1"});
 if(rows?.length!==1)throw Error("Saved project asset was not found");
 const row=rows[0];
 if(kind && !String(row.mime_type||"").startsWith(kind+"/"))throw Error("The input asset is not a "+kind);
 return row;
}
async function ownedJob(user,jobId){
 requiredId(jobId,"job");
 const rows=await db("cbted_media_jobs","GET",{id:"eq."+jobId,owner_id:"eq."+user,limit:"1"});
 if(rows?.length!==1)throw Error("Media job not found");
 return rows[0];
}
async function audit(user,job,event,details={}){
 await db("cbted_media_job_events","POST",{}, {owner_id:user,job_id:job,event,details});
}
async function fingerprint(data){
 const payload=JSON.stringify([data.project_id,data.provider,data.kind,data.model,data.prompt,
  data.settings,data.source_asset_id,data.quote_credits,data.billing_mode]);
 const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(payload)));
 return [...bytes].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function assess(job){
 return generationDecision({
  provider:job.provider,estimatedCredits:job.quote_credits===null?undefined:Number(job.quote_credits),
  includedRemaining:job.allowance_included_remaining===null?undefined:Number(job.allowance_included_remaining),
  remainingSource:job.allowance_source,observedAt:job.allowance_observed_at,
  billingMode:job.billing_mode
 });
}
function cleanQuote(body,provider){
 if(provider==="chatgpt")return {quote_credits:0,billing_mode:"native",
  quote_observed_at:new Date().toISOString(),allowance_included_remaining:null,
  allowance_source:"unknown",allowance_observed_at:null};
 const quote=body.estimated_credits;
 if(quote!=null&&(!number(quote)||quote>100000))throw Error("Invalid provider credit quote");
 const allowedModes=new Set(["credits","free_generation"]);
 const billing=String(body.billing_mode||"credits");
 if(!allowedModes.has(billing))throw Error("Invalid provider billing mode");
 const included=body.included_remaining;
 if(included!=null&&(!number(included)||included>1000000))throw Error("Invalid monthly included allowance");
 const source=body.allowance_source==="provider_tool"?"provider_tool":body.allowance_source==="user_entered"?"user_entered":"unknown";
 const observed=source==="provider_tool"&&typeof body.observed_at==="string"?new Date(body.observed_at):null;
 const observedAt=observed&&Number.isFinite(+observed)?observed.toISOString():null;
 return {quote_credits:quote??null,billing_mode:billing,quote_observed_at:quote!=null?new Date().toISOString():null,
  allowance_included_remaining:included??null,allowance_source:source,allowance_observed_at:observedAt};
}
async function prepare(user,body){
 const projectId=requiredId(body.project_id,"project");await ownedProject(user,projectId);
 const spec={provider:body.provider,kind:body.kind,prompt:body.prompt,model:body.model||null,
  aspect_ratio:body.aspect_ratio||"auto",duration:body.duration,estimated_credits:body.estimated_credits};
 validGenerationSpec(spec);
 if(spec.provider==="chatgpt"&&spec.kind!=="image")throw Error("Native ChatGPT generation supports images here; video needs a connected video provider");
 if(body.run_id){
  requiredId(body.run_id,"run");
  const runs=await db("production_runs","GET",{id:"eq."+body.run_id,project_id:"eq."+projectId,limit:"1"});
  if(runs?.length!==1)throw Error("Production run not found in project");
 }
 if(body.source_asset_id)await ownedAsset(projectId,body.source_asset_id,"image");
 const settings={aspect_ratio:spec.aspect_ratio,count:1,...(spec.kind==="video"&&spec.duration?{duration:spec.duration}:{})};
 const quote=cleanQuote(body,spec.provider);
 const draft={owner_id:user,project_id:projectId,run_id:body.run_id||null,
  step_key:typeof body.step_key==="string"?body.step_key.slice(0,120):null,
  provider:spec.provider,kind:spec.kind,model:spec.model,prompt:spec.prompt,
  settings,source_asset_id:body.source_asset_id||null,...quote};
 const decision=assess(draft);
 const row={...draft,quote_fingerprint:await fingerprint(draft),
  status:decision.status,approval_required:decision.approvalRequired,approval_reason:decision.reason};
 const saved=(await db("cbted_media_jobs","POST",{},row))?.[0];
 if(!saved?.id)throw Error("Failed to register media generation");
 await audit(user,saved.id,"prepared",{provider:spec.provider,estimated_credits:quote.quote_credits,approval_required:decision.approvalRequired});
 return {job:saved,credit_decision:decision,executed:false};
}
async function requote(user,body){
 const job=await ownedJob(user,body.job_id);
 if(!["awaiting_quote","awaiting_approval","ready","approved"].includes(job.status))throw Error("This job has already started or closed");
 const quote=cleanQuote(body,job.provider);
 const draft={...job,...quote};
 const decision=assess(draft);
 const values={...quote,quote_fingerprint:await fingerprint(draft),status:decision.status,
  approval_required:decision.approvalRequired,approval_reason:decision.reason,
  approved_max_credits:null,approved_fingerprint:null,approved_at:null,updated_at:new Date().toISOString()};
 const updated=(await db("cbted_media_jobs","PATCH",{id:"eq."+job.id,owner_id:"eq."+user},values))?.[0];
 await audit(user,job.id,"quoted",{credits:quote.quote_credits,approval_required:decision.approvalRequired,reason:decision.reason});
 return {job:updated,credit_decision:decision,executed:false};
}
async function decide(user,body){
 const job=await ownedJob(user,body.job_id);
 if(!["awaiting_approval","awaiting_quote"].includes(job.status))throw Error("No approval is currently pending for this job");
 if(body.decision==="rejected"){
  await db("cbted_media_jobs","PATCH",{id:"eq."+job.id,owner_id:"eq."+user},
   {status:"rejected",approval_reason:"Creator rejected spending",updated_at:new Date().toISOString()});
  await audit(user,job.id,"rejected");return {status:"rejected",spent:false};
 }
 if(body.decision!=="approved")throw Error("Choose Approve or Reject");
 if(job.status==="awaiting_quote"||job.quote_credits===null)throw Error("Get an exact credit quote before approving any spend");
 const quote=Number(job.quote_credits);
 if(!number(body.max_credits)||body.max_credits!==quote)throw Error("Approve the precise current quoted credit amount; changed prices need a new approval");
 const updated=(await db("cbted_media_jobs","PATCH",{id:"eq."+job.id,owner_id:"eq."+user,status:"eq.awaiting_approval"},
 {status:"approved",approved_at:new Date().toISOString(),approved_max_credits:quote,
  approved_fingerprint:job.quote_fingerprint,updated_at:new Date().toISOString()}))?.[0];
 if(!updated?.id)throw Error("Job status changed; refresh before approving");
 await audit(user,job.id,"approved",{credits:quote});
 return {status:"approved",job_id:job.id,max_credits:quote,spent:false};
}
async function claim(user,body){
 const job=await ownedJob(user.id,body.job_id);
 const response=await fetch(ROOT+"/rest/v1/rpc/cbted_claim_media_job",{method:"POST",
  headers:{apikey:PUB,Authorization:"Bearer "+user.token,"content-type":"application/json"},
  body:JSON.stringify({p_job:job.id})});
 const payload=await response.text();let data;try{data=JSON.parse(payload)}catch{throw Error("Claim response was invalid")}
 if(!response.ok)throw Error(String(data.message||"Generation cannot start").slice(0,250));
 return data;
}
async function submitted(user,body){
 const job=await ownedJob(user,body.job_id);
 const task=String(body.provider_job_id||"").trim();
 if(task.length<3||task.length>500)throw Error("Actual provider generation task ID required");
 if(job.status==="submitted"&&job.provider_job_id===task)return {status:"submitted",job_id:job.id};
 if(job.status!=="claimed")throw Error("The job must be claimed before submitting to the provider");
 const rows=await db("cbted_media_jobs","PATCH",{id:"eq."+job.id,owner_id:"eq."+user,status:"eq.claimed"},
  {provider_job_id:task,status:"submitted",submitted_at:new Date().toISOString(),updated_at:new Date().toISOString()});
 if(!rows?.[0])throw Error("The generation job changed status");
 await audit(user,job.id,"submitted",{provider_job_id:task});
 return {status:"submitted",job_id:job.id};
}
function permittedMediaUrl(value,provider){
 let u;try{u=new URL(value)}catch{throw Error("Invalid media result URL")}
 if(u.protocol!=="https:"||u.port||u.username||u.password)throw Error("HTTPS media URL required");
 const hosts=String(Deno.env.get("CBTED_MEDIA_ALLOWED_HOSTS")||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
 const hostname=u.hostname.toLowerCase();
 if(!hosts.length || !hosts.some(h=>hostname===h||hostname.endsWith("."+h)))throw Error("That provider media host has not yet been authorised for import");
 if(u.pathname.length>1500)throw Error("Media URL path too long");
 return u.toString();
}
function mediaType(bytes,type){
 if(type==="image/png"&&bytes.length>24&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)return "png";
 if(type==="image/jpeg"&&bytes[0]===255&&bytes[1]===216)return "jpg";
 if(type==="image/webp"&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP")return "webp";
 if(type==="video/mp4"&&String.fromCharCode(...bytes.slice(4,8))==="ftyp")return "mp4";
 if(type==="video/webm"&&bytes[0]===26&&bytes[1]===69&&bytes[2]===223&&bytes[3]===163)return "webm";
 throw Error("Returned media does not match a supported image/video file signature");
}
async function importResult(user,body){
 const job=await ownedJob(user,body.job_id);
 if(job.status!=="submitted")throw Error("Verify a submitted provider task before importing media");
 const url=permittedMediaUrl(body.result_url,job.provider);
 const timeout=AbortSignal.timeout(30000);
 const remote=await fetch(url,{redirect:"error",signal:timeout});
 if(!remote.ok)throw Error("Provider media could not be downloaded");
 const type=String(remote.headers.get("content-type")||"").split(";")[0].toLowerCase();
 if(!type.startsWith(job.kind+"/"))throw Error("Provider returned wrong media type");
 const limit=job.kind==="image"?25000000:80000000;
 const declared=Number(remote.headers.get("content-length")||0);
 if(declared>limit)throw Error("Generated file exceeds safe import size");
 const data=new Uint8Array(await remote.arrayBuffer());
 if(!data.length||data.length>limit)throw Error("Imported file is empty or too large");
 const extension=mediaType(data,type);
 const assetId=crypto.randomUUID();
 const path=user+"/"+job.project_id+"/"+job.kind+"s/"+assetId+"."+extension;
 const storageUrl=ROOT+"/storage/v1/object/"+BUCKET+"/"+path;
 const uploaded=await fetch(storageUrl,{method:"POST",headers:{apikey:SERVICE,Authorization:"Bearer "+SERVICE,"Content-Type":type,"x-upsert":"false"},body:data});
 if(!uploaded.ok)throw Error("Private Supabase media upload failed");
 const record=(await db("assets","POST",{},{
  project_id:job.project_id,asset_role:"generated",
  filename:assetId+"."+extension,storage_path:path,mime_type:type,
  metadata:{generator:job.provider,model:job.model,job_id:job.id,provider_job_id:job.provider_job_id}
 }))?.[0];
 if(!record?.id)throw Error("Provider media uploaded but asset record failed; contact support");
 const rows=await db("cbted_media_jobs","PATCH",{id:"eq."+job.id,owner_id:"eq."+user,status:"eq.submitted"},{
  result_asset_id:record.id,status:"needs_review",updated_at:new Date().toISOString()});
 if(!rows?.[0])throw Error("Job changed before media could be linked");
 await audit(user,job.id,"imported",{asset_id:record.id,bytes:data.byteLength,mime_type:type});
 return {job_id:job.id,status:"needs_review",asset_id:record.id,bytes:data.byteLength,
  message:"Real private media saved. Creative review required before completion."};
}
async function verify(user,body){
 const job=await ownedJob(user,body.job_id);
 if(job.status!=="needs_review"||!job.result_asset_id)throw Error("No imported media is awaiting review");
 const note=String(body.review_note||"").trim();
 if(note.length<15||note.length>2000)throw Error("Provide a specific review note about the actual image or video");
 if(!["passed","failed"].includes(body.decision))throw Error("Choose passed or failed");
 await ownedAsset(job.project_id,job.result_asset_id,job.kind);
 const status=body.decision==="passed"?"completed":"failed";
 await db("cbted_media_jobs","PATCH",{id:"eq."+job.id,owner_id:"eq."+user,status:"eq.needs_review"},
  {status,updated_at:new Date().toISOString(),failure_reason:status==="failed"?note:null});
 await audit(user,job.id,"review_"+body.decision,{note,asset_id:job.result_asset_id});
 return {status,job_id:job.id,asset_id:job.result_asset_id};
}
async function reference(user,body){
 const project=requiredId(body.project_id,"project");
 await ownedProject(user,project);
 const asset=await ownedAsset(project,body.asset_id,"image");
 if(!asset.storage_path||asset.storage_path.includes(".."))throw Error("Invalid stored asset path");
 const res=await fetch(ROOT+"/storage/v1/object/sign/"+BUCKET+"/"+asset.storage_path,{method:"POST",
  headers:{apikey:SERVICE,Authorization:"Bearer "+SERVICE,"Content-Type":"application/json"},
  body:JSON.stringify({expiresIn:900})});
 if(!res.ok)throw Error("Cannot sign the private approved reference image");
 const data=await res.json(),link=data.signedURL||data.signedUrl;
 if(!link)throw Error("Reference image URL not returned");
 return {project_id:project,asset_id:asset.id,media_type:asset.mime_type,expires_in_seconds:900,
  temporary_image_url:link.startsWith("http")?link:ROOT+"/storage/v1"+(link.startsWith("/")?link:"/"+link)};
}
Deno.serve(async(request)=>{
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:COMMON});
 const url=new URL(request.url),action=url.pathname.split("/").pop();
 if(request.method==="GET"&&action==="health")return result({name:"CBTeD Media Gate",status:"online",paid_generation:"delegated to authorised ChatGPT tools",media_import_configured:!!Deno.env.get("CBTED_MEDIA_ALLOWED_HOSTS")});
 try{
  const user=await currentUser(request);
  if(request.method==="GET"&&action==="jobs"){
   await ownedProject(user.id,url.searchParams.get("project_id"));
   const jobs=await db("cbted_media_jobs","GET",{project_id:"eq."+url.searchParams.get("project_id"),
    owner_id:"eq."+user.id,order:"created_at.desc",limit:"75"});
   return result({jobs});
  }
  if(request.method!=="POST")return result({error:"Method not supported"},405);
  if(Number(request.headers.get("content-length")||0)>45000)return result({error:"Request too large"},413);
  const body=await request.json();
  if(!body||typeof body!=="object"||Array.isArray(body))throw Error("Invalid JSON object");
  if(action==="prepare")return result(await prepare(user.id,body));
  if(action==="quote")return result(await requote(user.id,body));
  if(action==="approve")return result(await decide(user.id,body));
  if(action==="claim")return result(await claim(user,body));
  if(action==="submitted")return result(await submitted(user.id,body));
  if(action==="import")return result(await importResult(user.id,body));
  if(action==="verify")return result(await verify(user.id,body));
  if(action==="reference")return result(await reference(user.id,body));
  return result({error:"Unknown media action"},404);
 }catch(e){
  const reason=String(e?.message||"Request denied").slice(0,300);
  const status=/not configured|not yet been authorised/i.test(reason)?503:/sign in|expired/i.test(reason)?401:400;
  return result({error:reason},status);
 }
});
