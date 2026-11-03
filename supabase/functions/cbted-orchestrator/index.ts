// CBTeD authenticated orchestration gateway. GitHub is the code source of truth.
// Native ChatGPT tools cannot be intercepted here. Backend-managed execution IS gated.
import {AGENTS,buildPlan,authorisation,modelInstruction} from "../_shared/production.mjs";
const ROOT=(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function key(){
 const plain=Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||Deno.env.get("SUPABASE_ANON_KEY");
 if(plain)return plain;
 try{const keys=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}");return Deno.env.get(keys.default)||keys.default||"";}catch{return "";}
}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store","access-control-allow-origin":"*","access-control-allow-headers":"authorization,apikey,content-type","access-control-allow-methods":"POST,GET,OPTIONS"}});
const requiredUUID=(value,label)=>{if(typeof value!=="string"||!UUID.test(value))throw Error("Invalid "+label);return value;};
async function requestJSON(url,headers={},method="GET",body=undefined){
 const resp=await fetch(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 const txt=await resp.text();let payload;try{payload=txt?JSON.parse(txt):{};}catch{throw Error("Remote service returned invalid JSON");}
 if(!resp.ok)throw Error("Backend request failed ("+resp.status+"): "+String(payload.message||payload.error||"Access denied").slice(0,180));
 return payload;
}
async function identity(request){
 const match=/^Bearer ([^\s]+)$/.exec(request.headers.get("authorization")||"");
 if(!match)throw Error("Authentication required");
 if(!ROOT||!key())throw Error("Supabase configuration missing");
 const result=await requestJSON(ROOT+"/auth/v1/user",{apikey:key(),Authorization:"Bearer "+match[1]});
 return {token:match[1],id:requiredUUID(result.id,"account")};
}
const dbHeaders=(token,write=false)=>({apikey:key(),Authorization:"Bearer "+token,"content-type":"application/json",...(write?{Prefer:"return=representation"}:{})});
async function rest(token,table,query={}){
 const permitted=["projects","source_versions","project_rules","production_runs","production_steps","production_approvals","assets"];
 if(!permitted.includes(table))throw Error("Invalid table");
 const qs=new URLSearchParams(query);
 return requestJSON(ROOT+"/rest/v1/"+table+"?"+qs,dbHeaders(token));
}
async function rpc(token,name,params){
 const permitted=["cbted_prepare_production","cbted_decide_production_step","cbted_claim_production_step","cbted_finish_production_step","cbted_retry_production_step"];
 if(!permitted.includes(name))throw Error("Invalid RPC");
 return requestJSON(ROOT+"/rest/v1/rpc/"+name,dbHeaders(token,true),"POST",params);
}
async function requireProject(token,id){
 requiredUUID(id,"project");
 const rows=await rest(token,"projects",{id:"eq."+id,select:"id,title",limit:"1"});
 if(rows.length!==1)throw Error("Project is not owned or does not exist");
 return rows[0];
}
async function requireRun(token,runId){
 requiredUUID(runId,"run");
 const runs=await rest(token,"production_runs",{id:"eq."+runId,limit:"1"});
 if(runs.length!==1)throw Error("Run is not owned or does not exist");
 return runs[0];
}
async function state(token,runId){
 const run=await requireRun(token,runId);
 const [steps,approvals]=await Promise.all([
   rest(token,"production_steps",{run_id:"eq."+runId,order:"sequence_index.asc",limit:"200"}),
   rest(token,"production_approvals",{run_id:"eq."+runId,order:"created_at.asc",limit:"200"})
 ]);
 return {run,steps,approvals};
}
function latestDecisions(approvals){
 const m={};for(const item of approvals)m[item.step_key]=item.decision;return m;
}
function planFromState(s){
 return {intent:s.run.intent,workflow:s.run.workflow,steps:s.steps.map((x,i)=>({
   key:x.step_key,agent:x.agent,studio:x.studio,kind:x.kind,depends_on:x.depends_on,approval_required:x.approval_required,sequence:i+1
 }))};
}
function preview(body){
 return buildPlan({workflow:body.workflow,intent:body.intent==="execute"?"execute":"plan",image_count:body.image_count??1,video_count:body.video_count??1});
}
async function fullRulebook(studio){
 // Reuse the pinned full rule documents from the existing MCP; do not invent partial rules.
 const path=ROOT+"/functions/v1/cbted-mcp";
 const result=await requestJSON(path,{"content-type":"application/json"},"POST",{jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"cbted_get_rulebook",arguments:{studio:studio==="audio"?"core":studio==="animation"?"animation":studio}}});
 if(result.error||result.result?.isError)throw Error("Full master/studio rules unavailable");
 const payload=result.result?.structuredContent||JSON.parse(result.result?.content?.[0]?.text||"{}");
 if(!Array.isArray(payload.documents)||!payload.documents.some(d=>d.path?.includes("Master_Workflow_Rules_Universal")))throw Error("Master source missing");
 return payload.documents.map(d=>"SOURCE "+d.path+" SHA "+d.sha+"\n"+d.content).join("\n\n");
}
function takePrompt(s,step,rulebook,original,projectRules){
 const previous=s.steps.filter(x=>x.status==="passed").map(x=>({stage:x.step_key,text:x.output_text?.slice(0,20000)||"",asset_id:x.asset_id||null}));
 return modelInstruction(step,rulebook,projectRules,original,JSON.stringify(previous),s.run.instructions);
}
async function privateImageData(token,asset){
 if(!asset||!["image/png","image/jpeg","image/webp"].includes(asset.mime_type))throw Error("Unsupported private reference image");
 const response=await fetch(ROOT+"/storage/v1/object/authenticated/cbted-project-assets/"+asset.storage_path,{headers:{apikey:key(),Authorization:"Bearer "+token}});
 if(!response.ok)throw Error("Cannot download required private reference image");
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes.length>14000000)throw Error("Reference image exceeds permitted input size");
 let encoded="";for(let i=0;i<bytes.length;i+=24576)encoded+=btoa(String.fromCharCode(...bytes.subarray(i,i+24576)));
 return "data:"+asset.mime_type+";base64,"+encoded;
}
async function loadActualImage(token,project,previousStep){
 if(!previousStep?.asset_id)throw Error("Actual preceding image is missing");
 const assets=await rest(token,"assets",{id:"eq."+previousStep.asset_id,project_id:"eq."+project,limit:"1"});
 const asset=assets[0];if(!asset)throw Error("Actual stored image not found");
 return privateImageData(token,asset);
}
async function runText(prompt,imageDataUrl=null){

 const secret=Deno.env.get("OPENAI_API_KEY"),model=Deno.env.get("CBTED_TEXT_MODEL");
 if(!secret||!model)throw Error("Text provider is not configured");
 const result=await requestJSON("https://api.openai.com/v1/responses",
 {Authorization:"Bearer "+secret,"content-type":"application/json"},"POST",
 {model,store:false,input:[{role:"user",content:[{type:"input_text",text:prompt},...(imageDataUrl?[{type:"input_image",image_url:imageDataUrl,detail:"high"}]:[])]}],max_output_tokens:8000});
 if(result.status!=="completed")throw Error("Text provider did not complete");
 const text=result.output?.flatMap(x=>x.content||[]).filter(x=>x.type==="output_text").map(x=>x.text).join("\n")||"";
 if(!text.trim())throw Error("Text provider returned no content");
 return {text,provider:"openai-responses",model,response_id:result.id};
}
async function runImage(prompt,user,project,token){
 const secret=Deno.env.get("OPENAI_API_KEY"),model=Deno.env.get("CBTED_IMAGE_MODEL");
 if(!secret||!model)throw Error("Image provider is not configured");
 const size=Deno.env.get("CBTED_IMAGE_SIZE")||"1536x864";
 const dimensions=/^(\\d{3,4})x(\\d{3,4})$/.exec(size),width=Number(dimensions?.[1]),height=Number(dimensions?.[2]);
 if(!dimensions||width%16||height%16||width>3840||height>2160||width/height>3||height/width>3)
  throw Error("Image size must be valid supported WIDTHxHEIGHT");
 const allAssets=await rest(token,"assets",{project_id:"eq."+project,limit:"200"});
 const references=allAssets.filter(a=>["reference","character_reference","style_reference","input_reference"].includes(a.asset_role)&&["image/png","image/jpeg","image/webp"].includes(a.mime_type));
 if(references.length>16)throw Error("More than 16 reference images: select a smaller project reference set");
 const images=[];for(const ref of references)images.push({image_url:await privateImageData(token,ref)});
 const result=await requestJSON("https://api.openai.com/v1/images/"+(images.length?"edits":"generations"),
 {Authorization:"Bearer "+secret,"content-type":"application/json"},"POST",
 {...(images.length?{images}:{}),model,prompt:prompt.slice(0,30000),size,n:1,output_format:"png"});
 const base64=result.data?.[0]?.b64_json;
 if(!base64||base64.length>50000000)throw Error("No valid image received from provider");
 const binary=atob(base64),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
 if(bytes.length<24||String.fromCharCode(...bytes.slice(1,4))!=="PNG")throw Error("Image provider did not return PNG");
 const picture=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const actualWidth=picture.getUint32(16),actualHeight=picture.getUint32(20);
 if(actualWidth!==width||actualHeight!==height)throw Error("Image output dimensions differ from the requested size");
 const id=crypto.randomUUID(),path=user+"/"+project+"/images/"+id+".png";
 const upload=await fetch(ROOT+"/storage/v1/object/cbted-project-assets/"+path,{
 method:"POST",headers:{apikey:key(),Authorization:"Bearer "+token,"Content-Type":"image/png","x-upsert":"false"},body:bytes});
 if(!upload.ok)throw Error("Generated image could not be persisted: "+upload.status);
 const asset=await requestJSON(ROOT+"/rest/v1/assets",dbHeaders(token,true),"POST",
 {project_id:project,asset_role:"generated",filename:id+".png",storage_path:path,mime_type:"image/png",width,height,metadata:{provider:"openai-images",model,reference_asset_ids:references.map(a=>a.id)}});
 return {asset_id:asset?.[0]?.id,provider:"openai-images",model};
}
async function executeOne(token,user,s){
 if(Deno.env.get("CBTED_ALLOW_PAID_GENERATION")!=="true")throw Error("Paid model execution is disabled");
 if(s.run.status==="completed"||s.run.status==="cancelled")throw Error("Run is closed");
 const planned=planFromState(s),states=Object.fromEntries(s.steps.map(x=>[x.step_key,x.status]));
 const approvals=latestDecisions(s.approvals);
 let chosen,blocked=[];
 for(const step of planned.steps){
  if(states[step.key]!=="pending")continue;
  const verdict=authorisation({plan:planned,step_key:step.key,states,approvals});
  if(verdict.allowed){chosen=step;break;}blocked.push({step:step.key,reason:verdict.reason});
 }
 if(!chosen)return {executed:false,blocked};
 if(!["text","image"].includes(chosen.kind))return {executed:false,blocked:[{step:chosen.key,reason:"No configured backend adapter for "+chosen.kind+"; actual generation required"}]};
 if(["audio_reviewer","video_reviewer","release_auditor"].includes(chosen.agent))
   return {executed:false,blocked:[{step:chosen.key,reason:"Cannot honestly review actual audio/video without a media-inspection adapter"}]};
 const actual=s.steps.find(x=>x.step_key===chosen.key);
 const other=s.steps.filter(x=>x.status==="passed");
 // Prompt engineer output is authoritative for each individual image.
 if(chosen.kind==="image"&&(!other.some(x=>x.step_key==="visual_prompt_"+chosen.key.split("_").pop()&&x.output_text?.trim())))
   return {executed:false,blocked:[{step:chosen.key,reason:"Verified image prompt missing"}]};
 const rulebook=await fullRulebook(chosen.studio);
 const src=s.run.source_version_id
   ? (await rest(token,"source_versions",{id:"eq."+s.run.source_version_id,project_id:"eq."+s.run.project_id,limit:"1"}))[0]
   : null;
 const rules=await rest(token,"project_rules",{project_id:"eq."+s.run.project_id,order:"created_at.desc",limit:"500"});
 const original=[src?.content||"",src?.ideas||"",src?.suggested_text||""].filter(Boolean).join("\n\n");
 const projectRules=rules.map(r=>r.scope+" "+r.rule_key+" revision "+r.revision_number+" locked "+r.is_locked+": "+r.body).join("\n");
 let prompt=takePrompt(s,chosen,rulebook,original,projectRules);
 const isReview=["writing_reviewer","image_reviewer"].includes(chosen.agent);
 if(isReview)prompt+="\\n\\nBegin with VERDICT: PASS only if the checked content meets all hard requirements. Otherwise begin with VERDICT: REPAIR and detail the defects. Never falsely approve.";
 const imageData=chosen.agent==="image_reviewer"
   ?await loadActualImage(token,s.run.project_id,s.steps.find(x=>x.step_key==="visual_generate_"+chosen.key.split("_").pop()))
   :null;
 await rpc(token,"cbted_claim_production_step",{p_run:s.run.id,p_step:chosen.key});
 try{
   const result=chosen.kind==="text"?await runText(prompt,imageData):await runImage(
    other.find(x=>x.step_key==="visual_prompt_"+chosen.key.split("_").pop())?.output_text||prompt,user,s.run.project_id,token);
   const reviewFailed=isReview&&!/^VERDICT:\\s*PASS\\b/i.test(result.text||"");
   await rpc(token,"cbted_finish_production_step",{
    p_run:s.run.id,p_step:chosen.key,p_result:reviewFailed?"failed":"passed",
    p_text:result.text||null,p_asset:result.asset_id||null,
    p_evidence:{provider:result.provider,model:result.model,response_id:result.response_id||null,check:"provider_returned_and_recorded"}
   });
   return {executed:true,step:chosen.key,kind:chosen.kind,asset_id:result.asset_id||null,review_failed:reviewFailed};
 }catch(e){
   await rpc(token,"cbted_finish_production_step",{p_run:s.run.id,p_step:chosen.key,p_result:"failed",p_evidence:{reason:String(e.message||e).slice(0,300)}}).catch(()=>{});
   throw e;
 }
}
Deno.serve(async(request)=>{
 if(request.method==="OPTIONS")return json({},204);
 const path=new URL(request.url).pathname.split("/").pop();
 if(request.method==="GET"&&path==="health")return json({name:"CBTeD Orchestrator",status:"online",provider_execution_enabled:Deno.env.get("CBTED_ALLOW_PAID_GENERATION")==="true"});
 if(request.method!=="POST")return json({error:"POST required"},405);
 try{
  const user=await identity(request);
  if(Number(request.headers.get("content-length")||0)>300000)return json({error:"Body too large"},413);
  const body=await request.json();
  if(!body||typeof body!=="object"||Array.isArray(body))throw Error("Invalid request");
  if(path==="plan"){
   const plan=preview(body);
   if(body.intent!=="execute")return json({...plan,created:false,executed:false});
   if(!plan.steps.length)throw Error("No executable work in plan");
   await requireProject(user.token,body.project_id);
   const instructions=String(body.instructions||"").trim();
   if(!instructions||instructions.length>20000)throw Error("Instructions required (max 20,000 characters)");
   if(body.source_version_id){
    requiredUUID(body.source_version_id,"source version");
    const src=await rest(user.token,"source_versions",{id:"eq."+body.source_version_id,project_id:"eq."+body.project_id,limit:"1"});
    if(src.length!==1)throw Error("Source version does not belong to the project");
   }
   const run_id=await rpc(user.token,"cbted_prepare_production",{
    p_project:body.project_id,p_request:body.request_id||crypto.randomUUID(),
    p_workflow:plan.workflow,p_instructions:instructions,
    p_source:body.source_version_id||null,p_steps:plan.steps
   });
   return json({run_id,created:true,executed:false,workflow:plan.workflow,steps:plan.steps.length});
  }
  if(path==="status")return json(await state(user.token,body.run_id));
  if(path==="approve"){
   await requireRun(user.token,body.run_id);
   const approval_id=await rpc(user.token,"cbted_decide_production_step",{p_run:body.run_id,p_step:body.step_key,p_decision:body.decision,p_note:body.note||null});
   return json({approval_id,decision:body.decision});
  }
  if(path==="execute-next"){
   const s=await state(user.token,body.run_id);
   return json(await executeOne(user.token,user.id,s));
  }
  if(path==="claim"){
   await requireRun(user.token,body.run_id);
   return json(await rpc(user.token,"cbted_claim_production_step",{p_run:body.run_id,p_step:body.step_key}));
  }
  if(path==="finish"){
   const r=await requireRun(user.token,body.run_id);
   const steps=await rest(user.token,"production_steps",{run_id:"eq."+r.id,step_key:"eq."+body.step_key,limit:"1"});
   if(steps.length!==1)throw Error("Stage not found");
   if(body.result==="passed"&&["image","video","audio"].includes(steps[0].kind)){
    const assets=await rest(user.token,"assets",{id:"eq."+requiredUUID(body.asset_id,"asset"),project_id:"eq."+r.project_id,limit:"1"});
    if(assets.length!==1)throw Error("Persisted owned asset missing");
    const h=await fetch(ROOT+"/storage/v1/object/info/cbted-project-assets/"+assets[0].storage_path,
      {method:"GET",headers:{apikey:key(),Authorization:"Bearer "+user.token}});
    if(!h.ok)throw Error("Storage object could not be verified");
   }
   return json(await rpc(user.token,"cbted_finish_production_step",{
    p_run:r.id,p_step:body.step_key,p_result:body.result,p_text:body.text||null,
    p_asset:body.asset_id||null,p_evidence:{external:true,claimed_check:body.evidence||null}
   }));
  }
  if(path==="retry"){
   await requireRun(user.token,body.run_id);
   return json({retried:await rpc(user.token,"cbted_retry_production_step",{p_run:body.run_id,p_step:body.step_key})});
  }
  return json({error:"Unknown action"},404);
 }catch(e){return json({error:String(e?.message||"Action rejected").slice(0,350)},400);}
});
