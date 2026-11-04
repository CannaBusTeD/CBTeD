// CBTeD ChatGPT MCP bridge. Private tools enforce Supabase user identity + RLS.
// No media provider is invoked here: ChatGPT runs available native creative tools.
// Source snapshots are bundled verbatim from GitHub with their original blob SHAs.
import {RULEBOOK} from "./rulebook.ts";
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") || "https://dmzzyfiwtosxtyekpbfi.supabase.co").replace(/\/$/, "");
const RESOURCE = SUPABASE_URL + "/functions/v1/cbted-mcp";
const METADATA = RESOURCE + "/.well-known/oauth-protected-resource";
const AUTH_ISSUER = SUPABASE_URL + "/auth/v1";
const headers = {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type, Authorization, Accept, Mcp-Session-Id, Mcp-Protocol-Version","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Vary":"Origin"};
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tool = (name,description,properties,required=[],readOnly=true,publicAccess=false) => ({
  name, description,
  inputSchema:{type:"object",properties,required,additionalProperties:false},
  annotations:{readOnlyHint:readOnly,destructiveHint:false,openWorldHint:false},
  securitySchemes:publicAccess?[{type:"noauth"}]:[{type:"oauth2",scopes:[]}]
});
const S={type:"string"}; const U={type:"string",format:"uuid"};
const tools = [
  tool("cbted_get_rulebook","FIRST for any CBTeD creative work. Return the COMPLETE authoritative universal master workflow and the chosen studio procedure with content and source SHA. This server supplies rules, while ChatGPT itself uses its available native writing/image/video tools one operation at a time. Do not claim an action occurred until its native tool result is verified.",{studio:{type:"string",enum:["core","writing","visual","animation"],description:"Studio whose complete instructions should accompany universal rules."}},["studio"],true,true),
  tool("cbted_list_projects","List projects belonging to the authenticated user, preserving project identity and continuity.",{},[],true),
  tool("cbted_get_project_context","Read an owned project, rules, source metadata, approvals, studio settings, assets, tasks, outputs and handoffs. For exact writing content call cbted_get_source_version after selecting the version.",{project_id:U},["project_id"],true),
  tool("cbted_get_source_version","Retrieve the actual complete source-version text, ideas and suggestions without substituting a summary.",{project_id:U,source_version_id:U},["project_id","source_version_id"],true),
  tool("cbted_create_project","Create a user-owned persistent creative project; this does not begin generation.",{title:{type:"string",minLength:1,maxLength:200},description:S},["title"],false),
  tool("cbted_create_source","Register a titled song, story, poem, script, treatment or other source within an owned project before adding versions.",{project_id:U,title:{type:"string",minLength:1,maxLength:200},source_kind:S},["project_id","title"],false),
  tool("cbted_save_writing_version","Append a new numbered version of an existing source, preserving previous drafts. Keep creator writing, ideas and suggestions in separate fields. Never silently approve this version.",{project_id:U,source_id:U,content:S,ideas:S,suggested_text:S,change_note:S},["project_id","source_id"],false),
  tool("cbted_approve_source_version","Record an explicit user decision about a particular source version. Approval is append-only and must not be invented or inferred.",{project_id:U,source_version_id:U,decision:{type:"string",enum:["approved","rejected","revoked"]},note:S},["project_id","source_version_id","decision"],false),
  tool("cbted_add_project_rule","Append a locked project or studio rule/correction, retaining previous revisions. Only use for a user-authorised decision.",{project_id:U,scope:{type:"string",enum:["project","writing","visual","animation"]},rule_key:{type:"string",minLength:1,maxLength:160},rule_kind:{type:"string",enum:["constraint","correction","decision","preference","reference"]},body:{type:"string",minLength:1},is_locked:{type:"boolean"}},["project_id","scope","rule_key","rule_kind","body"],false),
  tool("cbted_get_asset_link","For an asset owned by the connected user, create a short-lived signed URL to access its PRIVATE Supabase Storage file. ChatGPT must still inspect the actual source image rather than trusting its metadata.",{project_id:U,asset_id:U},["project_id","asset_id"],true),
  tool("cbted_route_task","CBTeD ChatGPT-native coordinator: classify a targeted creative request into independent specialist stages. Does NOT create a run, invoke generation, require the website or demand unrelated studios. For a verse edit, select editorial; for video from existing song and image, select video_from_assets.",{intent:{type:"string",enum:["critique","suggestions","line_edit","editorial","rewrite","new_song","verse","images","audio","video_from_assets","complete"]},has_existing_source:{type:"boolean"},has_image:{type:"boolean"},has_audio:{type:"boolean"},image_count:{type:"integer",minimum:1,maximum:20},video_count:{type:"integer",minimum:1,maximum:20}},["intent"],true),
  tool("cbted_plan_production","Plan a CBTeD workflow without generating content. intent=plan is read-only; intent=execute persists a new run but does not start any agents.",{project_id:U,workflow:{type:"string",enum:["writing","visual","animation","song_video","plan_only"]},intent:{type:"string",enum:["plan","execute"]},instructions:S,source_version_id:U,image_count:{type:"integer",minimum:1,maximum:20},video_count:{type:"integer",minimum:1,maximum:20}},["workflow","intent"],false),
  tool("cbted_get_production_status","Read an owned production run, every atomic step and its explicit approval decisions.",{run_id:U},["run_id"],true),
  tool("cbted_approve_production_step","Record a user-approved or revoked authorisation for one specific gated step. NEVER infer approval from a prior instruction or call this without the user's explicit decision.",{run_id:U,step_key:S,decision:{type:"string",enum:["approved","rejected","revoked"]},note:S},["run_id","step_key","decision"],false),
  tool("cbted_execute_next","Execute only the next authorised single production operation through the controlled backend. Paid provider generation is disabled unless backend credentials and opt-in are configured.",{run_id:U},["run_id"],false),
  tool("cbted_claim_production_step","Atomically claim one authorised stage before invoking a ChatGPT native tool. It rejects premature execution, missing approvals, and changed locked rules.",{run_id:U,step_key:S},["run_id","step_key"],false),
  tool("cbted_finish_production_step","Record actual output after a previously authorised tool operation. Media requires a project-owned verified private asset, not a prompt or temporary link.",{run_id:U,step_key:S,result:{type:"string",enum:["passed","failed"]},text:S,asset_id:U,evidence:{type:"object"}},["run_id","step_key","result"],false),
  tool("cbted_retry_production_step","Retry exactly one failed stage, preserving all previously passed stages and stopping after the permitted attempt count.",{run_id:U,step_key:S},["run_id","step_key"],false)

];
const isUUID = (v) => typeof v==="string" && uuidRe.test(v);
const requireUUID=(v,k)=>{if(!isUUID(v))throw Error("Invalid "+k);return v;};
const requiredText=(v,k,max=100000)=>{if(typeof v!=="string"||!v.trim()||v.length>max)throw Error("Invalid "+k);return v;};
const allowedText=(v,max=100000)=>{if(v===undefined||v===null)return null;if(typeof v!=="string"||v.length>max)throw Error("Text exceeds allowed length");return v;};
const ownedProject=async (token,id)=>{
 requireUUID(id,"project_id");
 const rows=await rest(token,"projects",{id:"eq."+id,select:"id,title,description,status,current_studio,created_at,updated_at",limit:"1"});
 if(!rows.length)throw Error("Project not found or not accessible");
 return rows[0];
};
function publishableKey(){
 const raw=Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
 if(raw){try{const k=JSON.parse(raw);if(k.default)return k.default;}catch(_e){}}
 return Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
}
async function authenticate(request){
 const match=/^Bearer ([^\s]+)$/.exec(request.headers.get("Authorization")||"");
 if(!match)return null;
 const key=publishableKey();if(!key)throw Error("Server publishable key not configured");
 const response=await fetch(SUPABASE_URL+"/auth/v1/user",{headers:{"apikey":key,"Authorization":"Bearer "+match[1]}});
 if(!response.ok)return null;
 const user=await response.json();
 if(!isUUID(user.id))return null;
 return {id:user.id,email:user.email||null,token:match[1]};
}
function challenge(){
 return 'Bearer resource_metadata="'+METADATA+'", error="invalid_token", error_description="Connect your CBTeD account to access private projects"';
}
function authError(){
 return {isError:true,content:[{type:"text",text:"CBTeD authentication required. Connect your existing CBTeD Supabase account."}],_meta:{"mcp/www_authenticate":[challenge()]}};
}
async function rest(token,table,query={},method="GET",body=null){
 const allowed=["projects","sources","source_versions","project_rules","assets","tasks","outputs","approvals","handoffs","studio_settings","project_runs"];
 if(!allowed.includes(table))throw Error("Unsupported table");
 const qs=new URLSearchParams(query);
 const url=SUPABASE_URL+"/rest/v1/"+table+(qs.toString()?"?"+qs:"");
 const request={method,headers:{"apikey":publishableKey(),"Authorization":"Bearer "+token,"Content-Type":"application/json","Prefer":"return=representation"}};
 if(body!==null)request.body=JSON.stringify(body);
 const response=await fetch(url,request);
 const text=await response.text();let data;
 try{data=text?JSON.parse(text):null;}catch(_e){throw Error("Database returned an invalid response");}
 if(!response.ok)throw Error("Database rejected request ("+response.status+"): "+String(data?.message||data?.error||"Access denied").slice(0,250));
 return data;
}
const byProject=(id,select="*")=>({project_id:"eq."+id,select,limit:"50"});
async function runTool(name,a,token,user){
 if(name==="cbted_route_task"){
   const routes={
    critique:["writing_critic","language_auditor"],
    suggestions:["writing_critic","language_auditor","writing_editor"],
    line_edit:["writing_editor","language_auditor","writing_reviewer"],
    editorial:["writing_critic","language_auditor","writing_editor","writing_synthesizer","writing_critic","language_auditor","writing_proofreader","writing_reviewer"],
    rewrite:["writing_critic","language_auditor","writing_editor","writing_synthesizer","writing_critic","language_auditor","writing_proofreader","writing_reviewer"],
    new_song:["writing_author","writing_critic","writing_editor","language_auditor","writing_synthesizer","writing_proofreader","writing_reviewer"],
    verse:["writing_author","writing_critic","language_auditor","writing_proofreader"],
    images:["visual_analyst","visual_tool_selector","visual_prompt_writer","image_generator","image_reviewer"],
    audio:["audio_director","audio_tool_selector","audio_generator","audio_reviewer"],
    video_from_assets:["storyboarding_director","motion_prompt_writer","video_tool_selector","video_generator","video_reviewer"]
   };
   const mode=a.intent;
   if(!routes[mode]&&mode!=="complete")throw Error("Unknown creative task");
   if(["editorial","rewrite","suggestions","critique","line_edit","video_from_assets"].includes(mode)&&!a.has_existing_source)throw Error("An existing source is required");
   if(mode==="video_from_assets"&&!a.has_image)throw Error("Existing image required for image-to-video");
   const countImage=a.image_count??1,countVideo=a.video_count??1;
   if(!Number.isInteger(countImage)||countImage<1||countImage>20||!Number.isInteger(countVideo)||countVideo<1||countVideo>20)throw Error("Invalid output count");
   const selected=mode==="complete"?["new_song","images","audio","video_from_assets"]:[mode];
   const stages=[];
   for(const group of selected)for(const agent of routes[group]){
     const studio=["critique","suggestions","line_edit","editorial","rewrite","new_song","verse"].includes(group)?"writing":group==="images"?"visual":group==="audio"?"audio":"animation";
     const count=["image_generator","image_reviewer","visual_prompt_writer"].includes(agent)?countImage:["video_generator","video_reviewer"].includes(agent)?countVideo:1;
     for(let index=1;index<=count;index++)stages.push({studio,agent,output:index});
   }
   return {intent:mode,studios:[...new Set(stages.map(s=>s.studio))],stages,existing_source_preserved:!!a.has_existing_source,existing_image_preserved:!!a.has_image,existing_audio_preserved:!!a.has_audio,generation_started:false,requires_website:false,note:"Follow authoritative studio rules and perform actual creative work inside ChatGPT. This is a routing plan, not an output."};
 }
 if(name.startsWith("cbted_")&&["cbted_plan_production","cbted_get_production_status","cbted_approve_production_step","cbted_execute_next","cbted_claim_production_step","cbted_finish_production_step","cbted_retry_production_step"].includes(name)){
   const endpoints={
     cbted_plan_production:"plan",cbted_get_production_status:"status",
     cbted_approve_production_step:"approve",cbted_execute_next:"execute-next",
     cbted_claim_production_step:"claim",cbted_finish_production_step:"finish",
     cbted_retry_production_step:"retry"
   };
   const endpoint=SUPABASE_URL+"/functions/v1/cbted-orchestrator/"+endpoints[name];
   const body=name==="cbted_get_production_status"||name==="cbted_execute_next"?{run_id:a.run_id}:
     name==="cbted_approve_production_step"?{run_id:a.run_id,step_key:a.step_key,decision:a.decision,note:a.note}:
     name==="cbted_claim_production_step"?{run_id:a.run_id,step_key:a.step_key}:
     name==="cbted_finish_production_step"?{run_id:a.run_id,step_key:a.step_key,result:a.result,text:a.text,asset_id:a.asset_id,evidence:a.evidence}:
     name==="cbted_retry_production_step"?{run_id:a.run_id,step_key:a.step_key}:a;
   const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","apikey":publishableKey(),"Authorization":"Bearer "+token},body:JSON.stringify(body)});
   let value;try{value=await response.json();}catch{throw Error("Orchestrator returned invalid JSON");}
   if(!response.ok)throw Error("Orchestrator blocked: "+String(value.error||"Access denied").slice(0,250));
   return value;
 }
 if(name==="cbted_get_rulebook"){
   const studio=a.studio||"core";
   if(!["core","writing","visual","animation"].includes(studio))throw Error("Unknown studio");
   const paths=["core/CBTeD_Workflow.md"];
   if(studio==="writing")paths.push("writing/Writing_Studio.md","writing/Lyric_Master.md");
   if(studio==="visual")paths.push("visual/Visual_Studio.md","visual/sources/Image_Generation_Workflow.md","visual/Visual_Studio_Operating_Procedure.md");
   if(studio==="animation")paths.push("animation/Animation_Studio.md","animation/sources/Image_to_Video_Prompt_Master_Guide.md","animation/sources/Original_Image_to_Video_Guide_Archive.txt");
   return {studio,source:"Pinned verbatim GitHub source snapshot",documents:paths.map(path=>({path,sha:RULEBOOK[path].sha,content:RULEBOOK[path].content})),execution_role:"ChatGPT performs creative operations using its own available native tools. MCP only supplies instructions and project state. Follow the full authoritative rules; no shortcut to a prompt-only substitute."};
 }
 if(name==="cbted_list_projects"){
   return {projects:await rest(token,"projects",{select:"id,title,description,status,current_studio,created_at,updated_at",order:"updated_at.desc",limit:"50"})};
 }
 if(name==="cbted_create_project"){
   const title=requiredText(a.title,"title",200);
   const row={owner_id:user.id,title,description:allowedText(a.description,5000)};
   return {project:(await rest(token,"projects",{}, "POST",row))[0]};
 }
 if(name==="cbted_get_project_context"){
   const p=await ownedProject(token,a.project_id);
   const pid=p.id;
   const [rules,sources,versions,approvals,settings,assets,tasks,outputs,handoffs]=await Promise.all([
     rest(token,"project_rules",{...byProject(pid),order:"created_at.desc",limit:"100"}),
     rest(token,"sources",{...byProject(pid),order:"created_at.desc"}),
     rest(token,"source_versions",{...byProject(pid,"id,project_id,source_id,version_number,based_on_id,change_note,created_at"),order:"created_at.desc",limit:"100"}),
     rest(token,"approvals",{...byProject(pid),order:"created_at.desc",limit:"100"}),
     rest(token,"studio_settings",{...byProject(pid),order:"created_at.desc",limit:"50"}),
     rest(token,"assets",{...byProject(pid),order:"created_at.desc",limit:"100"}),
     rest(token,"tasks",{...byProject(pid),order:"updated_at.desc",limit:"100"}),
     rest(token,"outputs",{...byProject(pid,"id,project_id,task_id,output_kind,sequence_index,asset_id,source_version_id,verification_status,details,created_at"),order:"created_at.desc",limit:"100"}),
     rest(token,"handoffs",{...byProject(pid),order:"created_at.desc",limit:"50"})
   ]);
   return {project:p,rules,sources,source_versions:versions,approvals,studio_settings:settings,assets,tasks,outputs,handoffs,note:"Read exact writing with cbted_get_source_version. Read full master rules using cbted_get_rulebook. Output metadata alone is not evidence of generated media."};
 }
 if(name==="cbted_get_source_version"){
   await ownedProject(token,a.project_id);requireUUID(a.source_version_id,"source_version_id");
   const rows=await rest(token,"source_versions",{...byProject(a.project_id),id:"eq."+a.source_version_id,limit:"1"});
   if(!rows.length)throw Error("Version not found or access denied");
   return {source_version:rows[0]};
 }
 if(name==="cbted_create_source"){
   await ownedProject(token,a.project_id);
   return {source:(await rest(token,"sources",{},"POST",{project_id:a.project_id,title:requiredText(a.title,"title",200),source_kind:allowedText(a.source_kind,60)||"other"}))[0]};
 }
 if(name==="cbted_save_writing_version"){
   await ownedProject(token,a.project_id);requireUUID(a.source_id,"source_id");
   const sources=await rest(token,"sources",{...byProject(a.project_id),id:"eq."+a.source_id,limit:"1"});
   if(!sources.length)throw Error("Source not found or access denied");
   const prior=await rest(token,"source_versions",{...byProject(a.project_id,"id,version_number"),source_id:"eq."+a.source_id,order:"version_number.desc",limit:"1"});
   const content=allowedText(a.content,250000),ideas=allowedText(a.ideas,250000),suggested=allowedText(a.suggested_text,250000);
   if(![content,ideas,suggested].some(v=>v?.trim()))throw Error("Provide source content, ideas or suggestions");
   const record={project_id:a.project_id,source_id:a.source_id,version_number:(prior[0]?.version_number||0)+1,content,ideas,suggested_text:suggested,based_on_id:prior[0]?.id||null,change_note:allowedText(a.change_note,5000)};
   return {source_version:(await rest(token,"source_versions",{},"POST",record))[0],note:"Draft saved. Approval has not been assumed."};
 }
 if(name==="cbted_approve_source_version"){
   await ownedProject(token,a.project_id);requireUUID(a.source_version_id,"source_version_id");
   if(!["approved","rejected","revoked"].includes(a.decision))throw Error("Invalid decision");
   const versions=await rest(token,"source_versions",{...byProject(a.project_id,"id"),id:"eq."+a.source_version_id,limit:"1"});
   if(!versions.length)throw Error("Source version not found");
   return {approval:(await rest(token,"approvals",{},"POST",{project_id:a.project_id,source_version_id:a.source_version_id,decision:a.decision,decided_by:user.id,note:allowedText(a.note,5000)}))[0]};
 }
 if(name==="cbted_add_project_rule"){
   await ownedProject(token,a.project_id);
   if(!["project","writing","visual","animation"].includes(a.scope)||!["constraint","correction","decision","preference","reference"].includes(a.rule_kind))throw Error("Invalid scope or rule kind");
   const key=requiredText(a.rule_key,"rule_key",160);
   const prior=await rest(token,"project_rules",{...byProject(a.project_id,"id,revision_number"),scope:"eq."+a.scope,rule_key:"eq."+key,order:"revision_number.desc",limit:"1"});
   const row={project_id:a.project_id,scope:a.scope,rule_key:key,rule_kind:a.rule_kind,body:requiredText(a.body,"body",20000),is_locked:a.is_locked!==false,revision_number:(prior[0]?.revision_number||0)+1,supersedes_id:prior[0]?.id||null};
   return {rule:(await rest(token,"project_rules",{},"POST",row))[0]};
 }
 if(name==="cbted_create_task"){
   await ownedProject(token,a.project_id);
   if(!["writing","visual","animation"].includes(a.studio))throw Error("Invalid studio");
   const n=a.requested_units;if(!Number.isInteger(n)||n<1||n>50)throw Error("Invalid requested output count");
   const row={project_id:a.project_id,studio:a.studio,operation:requiredText(a.operation,"operation",1000),requested_units:n,completed_units:0,status:"pending",current_step:allowedText(a.current_step,5000)||"Retrieve source and rules; verify before each native creative action",requirements:a.requirements||{}};
   if(a.source_version_id)row.source_version_id=requireUUID(a.source_version_id,"source_version_id");
   if(a.start_asset_id)row.start_asset_id=requireUUID(a.start_asset_id,"start_asset_id");
   return {task:(await rest(token,"tasks",{},"POST",row))[0],executed:false,note:"Task recorded. No creative output has been generated."};
 }
 if(name==="cbted_record_output"){
   await ownedProject(token,a.project_id);requireUUID(a.task_id,"task_id");
   const tasks=await rest(token,"tasks",{...byProject(a.project_id),id:"eq."+a.task_id,limit:"1"});
   if(!tasks.length)throw Error("Task not found");
   const kinds=["text","image","video","audio","prompt","document","other"];
   if(!kinds.includes(a.output_kind))throw Error("Unsupported output kind");
   const row={project_id:a.project_id,task_id:a.task_id,output_kind:a.output_kind,verification_status:a.verification_status||"pending",details:{}};
   if(!["pending","passed","needs_repair","failed"].includes(row.verification_status))throw Error("Invalid verification status");
   if(a.sequence_index!==undefined){if(!Number.isInteger(a.sequence_index)||a.sequence_index<1||a.sequence_index>tasks[0].requested_units)throw Error("Invalid sequence index");row.sequence_index=a.sequence_index;}
   if(a.source_version_id)row.source_version_id=requireUUID(a.source_version_id,"source_version_id");
   if(a.asset_id){
     requireUUID(a.asset_id,"asset_id");
     const assets=await rest(token,"assets",{...byProject(a.project_id,"id"),id:"eq."+a.asset_id,limit:"1"});
     if(!assets.length)throw Error("Project asset not found");
     row.asset_id=a.asset_id;
   }
   if(["image","video","audio"].includes(a.output_kind)&&!row.asset_id)throw Error("Media outputs need an actually stored private project asset ID; a temporary ChatGPT file or generated prompt is not persistent.");
   if(a.content)row.content=allowedText(a.content,250000);
   if(!row.asset_id&&!row.content?.trim())throw Error("An actual output content or project asset ID is required");
   if(a.verification_note)row.details.verification_note=allowedText(a.verification_note,5000);
   if(row.verification_status==="passed"&&!row.details.verification_note)throw Error("Verification evidence/inspection note required before marking an output passed");
   return {output:(await rest(token,"outputs",{},"POST",row))[0],note:"Output recorded; no media-generation claim is made by this server."};
 }
 if(name==="cbted_set_task_state"){
   await ownedProject(token,a.project_id);requireUUID(a.task_id,"task_id");
   const taskRows=await rest(token,"tasks",{...byProject(a.project_id),id:"eq."+a.task_id,limit:"1"});
   if(!taskRows.length)throw Error("Task not found");
   const task=taskRows[0],statuses=["pending","in_progress","blocked","completed","failed","cancelled"];
   if(!statuses.includes(a.status))throw Error("Invalid status");
   const passed=await rest(token,"outputs",{...byProject(a.project_id,"id,sequence_index"),task_id:"eq."+a.task_id,verification_status:"eq.passed",limit:"100"});
   const verified=passed.filter(o=>o.sequence_index!==null);
   const completedUnits=new Set(verified.map(o=>o.sequence_index)).size;
   if(a.status==="completed"&&completedUnits!==task.requested_units)throw Error("All requested individual outputs must be recorded and verified before completing task");
   const patch={status:a.status,completed_units:Math.min(task.requested_units,completedUnits),current_step:allowedText(a.current_step,5000)||task.current_step};
   return {task:(await rest(token,"tasks",{id:"eq."+a.task_id,project_id:"eq."+a.project_id},"PATCH",patch))[0]};
 }
 if(name==="cbted_get_asset_link"){
   await ownedProject(token,a.project_id);requireUUID(a.asset_id,"asset_id");
   const rows=await rest(token,"assets",{...byProject(a.project_id),id:"eq."+a.asset_id,limit:"1"});
   if(!rows.length)throw Error("Asset not found");
   const asset=rows[0],parts=asset.storage_path.split("/").map(encodeURIComponent);
   const signed=await fetch(SUPABASE_URL+"/storage/v1/object/sign/cbted-project-assets/"+parts.join("/"),{method:"POST",headers:{"apikey":publishableKey(),"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({expiresIn:120})});
   if(!signed.ok)throw Error("Private storage rejected signed link request");
   const data=await signed.json();
   const relative=data.signedURL||data.signedUrl;
   if(!relative)throw Error("Private storage did not return a signed URL");
   return {asset,temporary_url:relative.startsWith("http")?relative:SUPABASE_URL+"/storage/v1"+(relative.startsWith("/")?relative:"/"+relative),expires_in_seconds:120,note:"Temporary read-only access. Inspect actual asset before creative use."};
 }
 throw Error("Unknown tool name");
}
function reply(id,result){return {jsonrpc:"2.0",id,result};}
function fail(id,code,message){return {jsonrpc:"2.0",id,error:{code,message}};}
function response(value,status=200,extra={}){return new Response(JSON.stringify(value),{status,headers:{...headers,...extra}});}
Deno.serve(async(request)=>{
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
 const path=new URL(request.url).pathname;
 if(request.method==="GET"){
   if(path.endsWith("/.well-known/oauth-protected-resource"))return response({resource:RESOURCE,authorization_servers:[AUTH_ISSUER],scopes_supported:["openid","email"],resource_documentation:"https://github.com/CannaBusTeD/CBTeD"});
   if(path.endsWith("/cbted-mcp")||path.endsWith("/cbted-mcp/"))return response({name:"CBTeD MCP",status:"online",version:"0.1.0",authentication:"OAuth/Supabase bearer required for private tools",creative_generation:"Runs in ChatGPT, not in MCP server",rule_documents:Object.keys(RULEBOOK).length});
   return response({error:"Not found"},404);
 }
 if(request.method!=="POST")return response({error:"Method not allowed"},405);
 if(!path.endsWith("/cbted-mcp")&&!path.endsWith("/cbted-mcp/"))return response({error:"Not found"},404);
 if(Number(request.headers.get("content-length")||0)>500000)return response({error:"Request too large"},413);
 let rpc;try{rpc=await request.json();}catch(_e){return response(fail(null,-32700,"Invalid JSON"),400);}
 if(!rpc||typeof rpc!=="object"||Array.isArray(rpc))return response(fail(null,-32600,"Invalid request"),400);
 if(rpc.method==="notifications/initialized")return new Response(null,{status:202,headers});
 if(rpc.method==="initialize"){
   const versions=["2025-11-25","2025-06-18","2025-03-26","2024-11-05"];
   const asked=rpc.params?.protocolVersion;
   return response(reply(rpc.id,{protocolVersion:versions.includes(asked)?asked:"2025-06-18",capabilities:{tools:{listChanged:false}},serverInfo:{name:"CBTeD",version:"0.1.0"},instructions:"Call cbted_get_rulebook first for the full authoritative rules before any creative work. Use ChatGPT native tools to perform each requested output independently; MCP is only the project memory/rules bridge. Never claim an output exists from a task record alone."}));
 }
 if(rpc.method==="ping")return response(reply(rpc.id,{}));
 if(rpc.method==="tools/list")return response(reply(rpc.id,{tools}));
 if(rpc.method==="tools/call"){
   const name=rpc.params?.name;
   if(!tools.some(t=>t.name===name))return response(fail(rpc.id,-32601,"Unknown tool"));
   const args=rpc.params?.arguments||{};
   if(typeof args!=="object"||Array.isArray(args))return response(fail(rpc.id,-32602,"Invalid arguments"));
   try{
     let identity=null;
     if(name!=="cbted_get_rulebook"){
       identity=await authenticate(request);
       if(!identity)return response(reply(rpc.id,authError()));
     }
     const result=await runTool(name,args,identity?.token||"",identity);
     return response(reply(rpc.id,{content:[{type:"text",text:JSON.stringify(result)}],structuredContent:result,isError:false}));
   }catch(e){return response(reply(rpc.id,{content:[{type:"text",text:String(e?.message||"Unexpected error").slice(0,600)}],isError:true}));}
 }
 return response(fail(rpc.id??null,-32601,"Unsupported method"));
});
