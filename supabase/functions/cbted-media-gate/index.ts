// CBTeD Media Credit Gate. Supabase is the account/project store, never a replacement
// for the connected Runway or Higgsfield creative tools available inside ChatGPT.
// Quote -> credit decision -> specific approval -> atomic claim -> provider submission
// -> private media import -> creative review. Never spend credits here.
import {generationDecision,validGenerationSpec,QUOTE_MAX_AGE_MS} from "../_shared/media-credit-policy.mjs";
import {assertQualityPreflight,assessQualityEvidence} from "../_shared/quality-gate.mjs";
const ROOT=(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const PUB=(()=>{const v=Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||Deno.env.get("SUPABASE_ANON_KEY");if(v)return v;try{return JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default||""}catch{return ""}})();
const BUCKET="cbted-project-assets";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const COMMON={"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*","access-control-allow-headers":"authorization,apikey,content-type,x-client-info","access-control-allow-methods":"GET,POST,OPTIONS"};
const VALID_TABLES=new Set(["projects","assets","project_rules","production_runs","production_steps","cbted_media_jobs","cbted_media_job_events"]);
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
async function ownedReference(user,assetId){
 requiredId(assetId,"character reference");
 const rows=await db("assets","GET",{id:"eq."+assetId,select:"id,project_id,mime_type,storage_path,asset_role",limit:"1"});
 if(rows?.length!==1||!["reference","character_reference"].includes(String(rows[0].asset_role||""))||
    !String(rows[0].mime_type||"").startsWith("image/"))throw Error("Approved image reference was not found");
 await ownedProject(user,rows[0].project_id);
 if(!rows[0].storage_path)throw Error("Reference has no stored image");
 return rows[0];
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
 // Caller-supplied provider_tool provenance is NOT trusted. The user's separate ChatGPT
 // connectors do not grant this Supabase service authenticated provider-balance access.
 // Until a backend-verifiable provider receipt exists, external generation is never auto-spent.
 // A real quote from a connected provider may still be approved by the creator for one job.
 const source=body.allowance_source==="user_entered"?"user_entered":"unknown";
 return {quote_credits:quote??null,billing_mode:billing,quote_observed_at:quote!=null?new Date().toISOString():null,
  allowance_included_remaining:included??null,allowance_source:source,allowance_observed_at:null};
}
async function prepare(user,body){
 const projectId=requiredId(body.project_id,"project");await ownedProject(user,projectId);
 const spec={provider:body.provider,kind:body.kind,prompt:body.prompt,model:body.model||null,
  aspect_ratio:body.aspect_ratio||"auto",duration:body.duration,estimated_credits:body.estimated_credits};
 let quality=null;
 if(["image","video"].includes(spec.kind) &&
    (body.run_id||body.quality||Deno.env.get("CBTED_VISUAL_QA_REQUIRED")==="true")){
  if(!body.quality)throw Error("Versioned visual QA contract required for this production stage");
  for(const assetId of body.quality.attached_character_asset_ids||[])await ownedReference(user,assetId);
  quality=assertQualityPreflight({kind:spec.kind,provider:spec.provider,prompt:spec.prompt,quality:body.quality});
 }
 validGenerationSpec(spec);
 if(spec.provider==="chatgpt"&&spec.kind!=="image")throw Error("Native ChatGPT generation supports images here; video needs a connected video provider");
 if(body.run_id){
  requiredId(body.run_id,"run");
  const runs=await db("production_runs","GET",{id:"eq."+body.run_id,project_id:"eq."+projectId,limit:"1"});
  if(runs?.length!==1)throw Error("Production run not found in project");
  const stepKey=String(body.step_key||"");
  if(!/^[a-z][a-z0-9_]{2,119}$/.test(stepKey))throw Error("A valid stage key is required for this production run");
  const stages=await db("production_steps","GET",{run_id:"eq."+body.run_id,project_id:"eq."+projectId,
    step_key:"eq."+stepKey,select:"step_key,kind,status,approval_required",limit:"1"});
  if(stages?.length!==1||stages[0].kind!==spec.kind||!["pending","in_progress"].includes(stages[0].status))
   throw Error("The linked production stage must be a matching pending or claimed media operation");
 }
 if(body.source_asset_id)await ownedAsset(projectId,body.source_asset_id,"image");
 const settings={aspect_ratio:spec.aspect_ratio,count:1,...((spec.kind==="video"||spec.kind==="audio")&&spec.duration?{duration:spec.duration}:{}),...(quality?{quality}: {})};
 if(quality){
  const sig=await fingerprint({project_id:projectId,provider:spec.provider,kind:spec.kind,
   model:spec.model,prompt:spec.prompt,settings:{...settings,quality:{...quality,request_signature:undefined}},
   source_asset_id:body.source_asset_id||null,quote_credits:0,billing_mode:"content"});
  quality.request_signature=sig;
  const old=await db("cbted_media_jobs","GET",{project_id:"eq."+projectId,owner_id:"eq."+user,
   select:"status,settings",order:"created_at.desc",limit:"100"});
  if(old?.some(j=>["failed","rejected"].includes(j.status)&&j.settings?.quality?.request_signature===sig)
     &&quality.user_authorised_identical_retry!==true)
   throw Error("Repeated failed generation unchanged; alter the scene or explicitly authorise the identical rerun");
 }
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
 if(job.run_id){
  const steps=await db("production_steps","GET",{run_id:"eq."+job.run_id,project_id:"eq."+job.project_id,
    step_key:"eq."+job.step_key,select:"status,kind",limit:"1"});
  if(steps?.length!==1||steps[0].status!=="in_progress"||steps[0].kind!==job.kind)
   throw Error("Claim and approve the linked production stage before spending generator credits");
 }
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
function permittedMediaUrl(value,provider,kind){
 let u;try{u=new URL(value)}catch{throw Error("Invalid media result URL")}
 if(u.protocol!=="https:"||u.port||u.username||u.password)throw Error("HTTPS media URL required");
 const hosts=String(Deno.env.get("CBTED_MEDIA_ALLOWED_HOSTS")||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
 const hostname=u.hostname.toLowerCase();
 const sunoAudioExport=provider==="suno" && kind==="audio" &&
  hostname==="suno-data-uploads.s3.amazonaws.com" && u.pathname.startsWith("/studio/uploads/");
 const configuredHost=hosts.some(h=>hostname===h||hostname.endsWith("."+h));
 if(!sunoAudioExport && !configuredHost)throw Error("That provider media host has not yet been authorised for import");
 if(u.pathname.length>1500)throw Error("Media URL path too long");
 return u.toString();
}
function mediaType(bytes,type){
 if(type==="image/png"&&bytes.length>24&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)return "png";
 if(type==="image/jpeg"&&bytes[0]===255&&bytes[1]===216)return "jpg";
 if(type==="image/webp"&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP")return "webp";
 if(type==="video/mp4"&&String.fromCharCode(...bytes.slice(4,8))==="ftyp")return "mp4";
 if(type==="video/webm"&&bytes[0]===26&&bytes[1]===69&&bytes[2]===223&&bytes[3]===163)return "webm";
 if(type==="audio/mpeg"&&bytes.length>1024&&(String.fromCharCode(...bytes.slice(0,3))==="ID3"||(bytes[0]===255&&(bytes[1]&224)===224)))return "mp3";
 if((type==="audio/wav"||type==="audio/x-wav")&&bytes.length>44&&
  String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WAVE")return "wav";
 if(type==="audio/mp4"&&bytes.length>16&&String.fromCharCode(...bytes.slice(4,8))==="ftyp")return "m4a";
 throw Error("Returned media does not match a supported image/video/audio file signature");
}
async function mediaDigest(bytes){
 const hash=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
 return Array.from(hash,byte=>byte.toString(16).padStart(2,"0")).join("");
}
function importedReceipt(job){
 return {job_id:job.id,status:job.status,asset_id:job.result_asset_id,message:"Media already imported."};
}
async function importResult(user,body){
 const job=await ownedJob(user,body.job_id);
 if(job.result_asset_id)return importedReceipt(job);
 if(job.status!=="submitted")throw Error("Verify a submitted provider task before importing media");
 const url=permittedMediaUrl(body.result_url,job.provider,job.kind);
 const timeout=AbortSignal.timeout(30000);
 const remote=await fetch(url,{redirect:"error",signal:timeout});
 if(!remote.ok)throw Error("Provider media could not be downloaded");
 const type=String(remote.headers.get("content-type")||"").split(";")[0].toLowerCase();
 if(!type.startsWith(job.kind+"/"))throw Error("Provider returned wrong media type");
 const limit=job.kind==="image"?25000000:job.kind==="audio"?45000000:80000000;
 const declared=Number(remote.headers.get("content-length")||0);
 if(declared>limit)throw Error("Generated file exceeds safe import size");
 const data=new Uint8Array(await remote.arrayBuffer());
 if(!data.length||data.length>limit)throw Error("Imported file is empty or too large");
 return persistResult(user,job,type,data);
}
async function persistResult(user,job,type,data){
 const extension=mediaType(data,type);
 const digest=await mediaDigest(data);
 const reservation=type+":"+digest;
 const filter={id:"eq."+job.id,owner_id:"eq."+user,status:"eq.submitted"};
 const reserved=await db("cbted_media_jobs","PATCH",{...filter,import_digest:"is.null"},{import_digest:reservation});
 if(!reserved?.length){
  const current=await ownedJob(user,job.id);
  if(current.result_asset_id)return importedReceipt(current);
  if(current.status!=="submitted"||current.import_digest!==reservation)throw Error("Another media result is reserved for this job");
 }
 const assetId=job.id;
 const path=user+"/"+job.project_id+"/"+job.kind+"s/"+assetId+"."+extension;
 const storageUrl=ROOT+"/storage/v1/object/"+BUCKET+"/"+path;
 const uploaded=await fetch(storageUrl,{method:"POST",headers:{apikey:SERVICE,Authorization:"Bearer "+SERVICE,"Content-Type":type,"x-upsert":"false"},body:data});
 if(!uploaded.ok){
  const stored=await fetch(ROOT+"/storage/v1/object/authenticated/"+BUCKET+"/"+path,{headers:{apikey:SERVICE,Authorization:"Bearer "+SERVICE}});
  if(!stored.ok||await mediaDigest(await stored.arrayBuffer())!==digest)throw Error("Private Supabase media upload failed");
 }
 const record=(await db("assets","POST",{},{
  id:assetId,project_id:job.project_id,asset_role:"generated",
  filename:assetId+"."+extension,storage_path:path,mime_type:type,
  metadata:{generator:job.provider,model:job.model,job_id:job.id,provider_job_id:job.provider_job_id}
 },"resolution=ignore-duplicates,return=representation"))?.[0] || await ownedAsset(job.project_id,assetId,job.kind);
 if(record.storage_path!==path||record.metadata?.job_id!==job.id)throw Error("Reserved asset does not match the job");
 if(!record?.id)throw Error("Provider media uploaded but asset record failed; contact support");
 const rows=await db("cbted_media_jobs","PATCH",{id:"eq."+job.id,owner_id:"eq."+user,status:"eq.submitted"},{
  result_asset_id:record.id,status:"needs_review",updated_at:new Date().toISOString()});
 if(!rows?.[0]){
  const current=await ownedJob(user,job.id);
  if(current.result_asset_id===record.id)return importedReceipt(current);
  throw Error("Job changed before media could be linked");
 }
 await audit(user,job.id,"imported",{asset_id:record.id,bytes:data.byteLength,mime_type:type});
 return {job_id:job.id,status:"needs_review",asset_id:record.id,bytes:data.byteLength,
  message:"Real private media saved. Creative review required before completion."};
}
const PNG_LIMIT=25000000;
async function readNativePng(request){
 if(request.headers.get("content-type")?.split(";")[0]!=="image/png"||!request.body)
  throw Error("Expected the generated PNG bytes");
 if(Number(request.headers.get("content-length"))>PNG_LIMIT)throw Error("PNG exceeds import limit");
 const reader=request.body.getReader(), chunks=[];
 let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   size+=value.length;
   if(size>PNG_LIMIT){await reader.cancel();throw Error("PNG exceeds import limit");}
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);
 let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const signature=[137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82];
 const end=[0,0,0,0,73,69,78,68,174,66,96,130];
 if(size<57||!signature.every((b,i)=>bytes[i]===b)||!end.every((b,i)=>bytes[size-12+i]===b))
  throw Error("Invalid or incomplete PNG");
 return bytes;
}
// Native workers receive a short-lived, write-only grant for the digest already
// recorded under their authenticated claim. The ordinary OAuth token stays in MCP.
const NATIVE_DIGEST=/^native-png-sha256:([a-f0-9]{64})$/;
async function nativeUploadKey(){
 return crypto.subtle.importKey("raw",new TextEncoder().encode(SERVICE),
  {name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
}
function grantMessage(user,jobId,project,run,step,digest,expires){
 return new TextEncoder().encode(JSON.stringify(["cbted/native-png/v1",ROOT,user,jobId,project,run,step,digest,expires]));
}
async function issueNativeGrant(user,job,digest){
 await checkNativeTarget(user,job,job.project_id,job.run_id,job.step_key);
 const expires=String(Math.floor(Date.now()/1000)+600);
 const signature=await crypto.subtle.sign("HMAC",await nativeUploadKey(),
  grantMessage(user,job.id,job.project_id,job.run_id,job.step_key,digest,expires));
 const query=new URLSearchParams({job_id:job.id,project_id:job.project_id,run_id:job.run_id,step_key:job.step_key});
 return {url:ROOT+"/functions/v1/cbted-media-gate/import-native-png?"+query,
  authorization:"CBTeD-Upload "+[user,digest,expires,btoa(String.fromCharCode(...new Uint8Array(signature)))].join("."),
  expires_in_seconds:600,content_type:"image/png",method:"POST"};
}
async function nativeGrantOwner(request,url){
 const header=request.headers.get("Authorization")||"";
 if(!header.startsWith("CBTeD-Upload "))return null;
 environment();
 const parts=header.slice("CBTeD-Upload ".length).split(".");
 const [user,digest,expires,mac]=parts;
 const now=Math.floor(Date.now()/1000);
 if(parts.length!==4||!UUID.test(user)||!/^[a-f0-9]{64}$/.test(digest)||!/^\d{10}$/.test(expires)||
    +expires<now||+expires>now+600||!/^[A-Za-z0-9+/]{43}=$/.test(mac))throw Error("Invalid or expired native upload grant");
 const q=url.searchParams;
 const message=grantMessage(user,q.get("job_id"),q.get("project_id"),q.get("run_id"),q.get("step_key"),digest,expires);
 if(!await crypto.subtle.verify("HMAC",await nativeUploadKey(),Uint8Array.from(atob(mac),c=>c.charCodeAt(0)),message))
  throw Error("Invalid native upload grant");
 return {user,digest};
}
async function checkNativeTarget(user,job,project,run,step){
 await ownedProject(user,project);
 
 if(job.project_id!==project||job.run_id!==run||job.step_key!==step||!/^visual_generate_[1-9]\d*$/.test(step)||
    job.provider!=="chatgpt"||job.kind!=="image"||job.billing_mode!=="native"||job.quote_credits!==0||job.approval_required!==false)
  throw Error("The file must match the exact owned native zero-credit image job");
 if(!job.result_asset_id){
  const stages=await db("production_steps","GET",{project_id:"eq."+project,run_id:"eq."+run,step_key:"eq."+step,select:"status,kind",limit:"1"});
  if(!job.claimed_at||!["claimed","submitted"].includes(job.status)||stages?.[0]?.status!=="in_progress"||stages[0].kind!=="image")
   throw Error("The image job and its generation stage must already be claimed");
 }
}
async function importNativePng(user,request,url,requiredDigest=null){
 const jobId=requiredId(url.searchParams.get("job_id"),"job");
 const project=requiredId(url.searchParams.get("project_id"),"project");
 const run=requiredId(url.searchParams.get("run_id"),"run");
 const step=url.searchParams.get("step_key");
 const job=await ownedJob(user,jobId);
 await checkNativeTarget(user,job,project,run,step);
 const data=await readNativePng(request), digest=await mediaDigest(data);
 if(requiredDigest && requiredDigest!==digest)throw Error("PNG differs from the authorised digest");
 if(!job.result_asset_id){
  if(job.provider_job_id?.startsWith("native-png-sha256:")&&job.provider_job_id!=="native-png-sha256:"+digest)
   throw Error("The submitted native artifact has a different digest");
  if(job.status==="claimed"){
   // A native local artifact has no external task ID. Identify the actual bytes received.
   const nativeId="native-png-sha256:"+digest;
   await submitted(user,{job_id:job.id,provider_job_id:nativeId});
   job.provider_job_id=nativeId;
  }
  await persistResult(user,job,"image/png",data);
 }
 return verifyStoredNativePng(user,job,digest,data.length);
}
// Read-only proof of the existing privately stored native PNG, with no job or review mutation.
async function verifyStoredNativePng(user,job,digest,expectedLength=null){
 const current=await ownedJob(user,job.id);
 await checkNativeTarget(user,current,job.project_id,job.run_id,job.step_key);
 if(current.result_asset_id!==job.id||current.import_digest!=="image/png:"+digest||
    current.provider_job_id!=="native-png-sha256:"+digest)
  throw Error("The saved file differs from the authorised PNG digest");
 const asset=await ownedAsset(job.project_id,job.id,"image");
 const path=user+"/"+job.project_id+"/images/"+job.id+".png";
 if(asset.storage_path!==path||asset.metadata?.job_id!==job.id)throw Error("Private asset binding mismatch");
 const readback=await fetch(ROOT+"/storage/v1/object/authenticated/"+BUCKET+"/"+path,
  {headers:{apikey:SERVICE,Authorization:"Bearer "+SERVICE}});
 if(!readback.ok)throw Error("Private asset readback failed");
 const stored=await readback.arrayBuffer();
 if((expectedLength!==null&&stored.byteLength!==expectedLength)||stored.byteLength<24||
    stored.byteLength>PNG_LIMIT||await mediaDigest(stored)!==digest)throw Error("Private asset readback mismatch");
 return {job_id:job.id,asset_id:asset.id,status:current.status,bytes:stored.byteLength,sha256:digest,private_bytes_verified:true};
}
async function verify(account,body){
 const job=await ownedJob(account.id,body.job_id);
 if(job.status!=="needs_review"||!job.result_asset_id)throw Error("No imported media is awaiting review");
 const note=String(body.review_note||"").trim();
 if(note.length<15||note.length>2000)throw Error("Provide a specific review note about the actual image/audio/video");
 if(!["passed","failed"].includes(body.decision))throw Error("Choose passed or failed");
 if(job.settings?.quality && body.decision==="passed"){
  const qa=assessQualityEvidence(job.settings.quality,body.quality_evidence);
  if(qa.status!=="passed")throw Error("Visual QA cannot pass: "+qa.reasons.join("; "));
  await audit(account.id,job.id,"quality_passed",{scene_id:job.settings.quality.scene_id,inspection:body.quality_evidence});
 }
 // This user-scoped SQL function atomically updates both the media job and
 // its linked production stage, verifying a private stored asset exists.
 const endpoint=ROOT+"/rest/v1/rpc/cbted_finish_media_generation";
 const r=await fetch(endpoint,{method:"POST",headers:{
  apikey:PUB,Authorization:"Bearer "+account.token,"content-type":"application/json"},
  body:JSON.stringify({p_job:job.id,p_decision:body.decision,p_note:note})});
 let data;try{data=await r.json()}catch{throw Error("Media review response was invalid");}
 if(!r.ok)throw Error("Media review rejected: "+String(data.message||data.error||"Stage not complete").slice(0,240));
 return data;
}
async function reference(user,body){
 const project=requiredId(body.project_id,"project");
 await ownedProject(user,project);
 const kind=["image","video","audio"].includes(body.kind)?body.kind:"image";
 let asset;
 try{asset=await ownedAsset(project,body.asset_id,kind);}
 catch(error){
  if(kind!=="image" || String(error?.message)!=="Saved project asset was not found")throw error;
  // A locked reference may be stored in the owner's shared library. Never resolve
  // arbitrary foreign assets or expand an unlocked/revoked reference list.
  const rules=await db("project_rules","GET",{project_id:"eq."+project,
   rule_key:"eq.image_generation_settings",scope:"in.(visual,project)",
   select:"scope,body,is_locked,revision_number",order:"revision_number.desc"});
  const current=new Map();
  for(const row of rules||[])if(!current.has(row.scope))current.set(row.scope,row);
  const locked=[...current.values()].filter(row=>row.is_locked===true);
  const authorized=locked.some(row=>{
   try{const settings=JSON.parse(row.body);
    return Array.isArray(settings.reference_ids)&&settings.reference_ids.includes(body.asset_id);
   }catch{return false;}
  });
  if(!authorized)throw error;
  asset=await ownedReference(user,body.asset_id);
  if(!String(asset.mime_type||"").startsWith("image/"))throw error;
 }
 if(!asset.storage_path||asset.storage_path.includes(".."))throw Error("Invalid stored asset path");
 const res=await fetch(ROOT+"/storage/v1/object/sign/"+BUCKET+"/"+asset.storage_path,{method:"POST",
  headers:{apikey:SERVICE,Authorization:"Bearer "+SERVICE,"Content-Type":"application/json"},
  body:JSON.stringify({expiresIn:900})});
 if(!res.ok)throw Error("Cannot sign the private approved reference image");
 const data=await res.json(),link=data.signedURL||data.signedUrl;
 if(!link)throw Error("Reference image URL not returned");
 const temporary=link.startsWith("http")?link:ROOT+"/storage/v1"+(link.startsWith("/")?link:"/"+link);
 return {project_id:project,reference_project_id:asset.project_id,asset_id:asset.id,media_type:asset.mime_type,
  expires_in_seconds:900,temporary_asset_url:temporary,
  ...(kind==="image"?{temporary_image_url:temporary}:{})};
}
Deno.serve(async(request)=>{
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:COMMON});
 const url=new URL(request.url),action=url.pathname.split("/").pop();
 if(request.method==="GET"&&action==="health")return result({name:"CBTeD Media Gate",status:"online",paid_generation:"delegated to authorised ChatGPT tools",media_import_configured:!!Deno.env.get("CBTED_MEDIA_ALLOWED_HOSTS"),native_png_import:1});
 try{
  if(request.method==="POST"&&action==="import-native-png"){
   const grant=await nativeGrantOwner(request,url);
   if(grant)return result(await importNativePng(grant.user,request,url,grant.digest));
  }
  const user=await currentUser(request);
  if(request.method==="GET"&&action==="jobs"){
   await ownedProject(user.id,url.searchParams.get("project_id"));
   const jobs=await db("cbted_media_jobs","GET",{project_id:"eq."+url.searchParams.get("project_id"),
    owner_id:"eq."+user.id,order:"created_at.desc",limit:"75"});
   return result({jobs});
  }
  if(request.method!=="POST")return result({error:"Method not supported"},405);
  if(action==="import-native-png")return result(await importNativePng(user.id,request,url));
  if(Number(request.headers.get("content-length")||0)>45000)return result({error:"Request too large"},413);
  const body=await request.json();
  if(!body||typeof body!=="object"||Array.isArray(body))throw Error("Invalid JSON object");
  if(action==="prepare")return result(await prepare(user.id,body));
  if(action==="quote")return result(await requote(user.id,body));
  if(action==="approve")return result(await decide(user.id,body));
  if(action==="claim")return result(await claim(user,body));
  if(action==="submitted"){
   const digest=NATIVE_DIGEST.exec(body.provider_job_id)?.[1];
   if(!digest)return result(await submitted(user.id,body));
   const job=await ownedJob(user.id,body.job_id);
   // Repeating the real digest of a completed native job is verification-only.
   // No generation, claim, submission, approval, or review is repeated.
   if(job.status==="completed"&&job.result_asset_id){
    if(job.provider_job_id!==body.provider_job_id||job.import_digest!=="image/png:"+digest)
     throw Error("Verification requires the existing completed native PNG digest");
    const proof=await verifyStoredNativePng(user.id,job,digest);
    const grant=await issueNativeGrant(user.id,job,digest);
    return result({...proof,verification_only:true,native_roundtrip_verified:false,private_png_upload:grant});
   }
   const grant=await issueNativeGrant(user.id,job,digest);
   const receipt=await submitted(user.id,body);
   return result({...receipt,private_png_upload:grant});
  }
  if(action==="import")return result(await importResult(user.id,body));
  if(action==="verify")return result(await verify(user,body));
  if(action==="reference")return result(await reference(user.id,body));
  return result({error:"Unknown media action"},404);
 }catch(e){
  const reason=String(e?.message||"Request denied").slice(0,300);
  const status=/not configured|not yet been authorised/i.test(reason)?503:/sign in|expired/i.test(reason)?401:400;
  return result({error:reason},status);
 }
});

