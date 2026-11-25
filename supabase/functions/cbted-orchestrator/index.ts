// CBTeD authenticated orchestration gateway. GitHub is the code source of truth.
// Native ChatGPT tools cannot be intercepted here. Backend-managed execution IS gated.
import {AGENTS,buildPlan,authorisation,modelInstruction,parseImageSize,reviewPassed} from "../_shared/production.mjs";
import {inspectAudio,readReviewAudio} from "../_shared/audio-review.mjs";
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
 if(!resp.ok){
  const endpoint=new URL(url);
  const code=String(payload.error?.code||payload.code||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,80);
  throw Error(`Request to ${endpoint.host}${endpoint.pathname} failed (HTTP ${resp.status}${code?", "+code:""})`);
 }
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
 const permitted=["projects","source_versions","approvals","project_rules","production_runs","production_steps","production_approvals","production_step_attempts","assets","handoffs"];
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
 const [steps,approvals,attempts]=await Promise.all([
   rest(token,"production_steps",{run_id:"eq."+runId,order:"sequence_index.asc",limit:"200"}),
   rest(token,"production_approvals",{run_id:"eq."+runId,order:"created_at.asc",limit:"200"}),
   rest(token,"production_step_attempts",{run_id:"eq."+runId,order:"recorded_at.desc",limit:"50"})
 ]);
 return {run,steps,approvals,attempts};
}
function latestDecisions(approvals){
 const m={};for(const item of approvals)m[item.step_key]=item.decision;return m;
}
function planFromState(s){
 return {intent:s.run.intent,workflow:s.run.workflow,steps:s.steps.map((x,i)=>({
   key:x.step_key,agent:x.agent,description:AGENTS[x.agent]?.role,studio:x.studio,kind:x.kind,depends_on:x.depends_on,approval_required:x.approval_required,sequence:i+1
 }))};
}
function preview(body){
 return buildPlan({workflow:body.workflow,intent:body.intent==="execute"?"execute":"plan",image_count:body.image_count??1,video_count:body.video_count??1});
}
async function fullRulebook(studio){
 // Reuse the pinned full rule documents from the existing MCP; do not invent partial rules.
 const path=ROOT+"/functions/v1/cbted-mcp";
 const result=await requestJSON(path,{"content-type":"application/json"},"POST",{jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"cbted_get_rulebook",arguments:{studio:["audio","publish"].includes(studio)?"core":studio==="animation"?"animation":studio}}});
 if(result.error||result.result?.isError)throw Error("Full master/studio rules unavailable");
 const payload=result.result?.structuredContent||JSON.parse(result.result?.content?.[0]?.text||"{}");
 if(!Array.isArray(payload.documents)||!payload.documents.some(d=>d.path==="core/CBTeD_Workflow.md"))throw Error("Master source missing");
 return payload.documents.map(d=>"SOURCE "+d.path+" SHA "+d.sha+"\n"+d.content).join("\n\n");
}
function takePrompt(s,step,rulebook,original,projectRules){
 const completed=s.steps.filter(x=>x.status==="passed");
 const selected=completed.find(item=>item.step_key==="writing_review")?.evidence?.selected_manuscript;
 const inputs=completed.map(x=>({stage:x.step_key,artifact:selected && x.step_key==="writing_proofread"?selected:x.output_text||null,asset_id:x.asset_id||null}));
 const latest=(keys)=>[...completed].reverse().find(x=>keys.includes(x.step_key)&&x.output_text)?.output_text;
 const manuscript=selected || latest(["writing_proofread","writing_rewrite","writing_draft"]);
 const draftStart=completed.find(x=>x.step_key==="writing_draft")?.started_at;
 const currentAttempts=(s.attempts||[]).filter(x=>!draftStart || Date.parse(x.recorded_at)>=Date.parse(draftStart));
 const reviewedVersion=currentAttempts.find(x=>x.step_key==="writing_proofread"&&x.status==="passed"&&x.output_text);
 const revisionSource=step.key==="writing_rewrite" && reviewedVersion ? reviewedVersion.output_text : null;
 const source=selected || original || s.run.instructions;
 const history=currentAttempts.filter(x=>x.step_key==="writing_review" && /^VERDICT:\s*REPAIR/i.test(x.output_text||"")).slice(0,1);
 const handoff=JSON.stringify({dependencies:step.depends_on,writing_state:{operation:s.run.workflow,source_version_id:s.run.source_version_id||null,stage:step.key,commissioned_original:!s.run.source_version_id&&["writing","song_video","song_video_publish","idea_to_publish","idea_to_publish_audio"].includes(s.run.workflow),current_draft_available:Boolean(manuscript)},planned_image_count:s.steps.filter(x=>x.agent==='image_generator').length,planned_clip_count:s.steps.filter(x=>x.agent==='video_generator').length,completed:["writing_reviewer","writing_proofreader"].includes(step.agent)?[]:step.key==="writing_rewrite"?inputs.filter(x=>["writing_critique","writing_edit","writing_language_audit"].includes(x.stage)):inputs,current_manuscript:revisionSource || manuscript,manuscript_under_revision:revisionSource,recorded_approvals:latestDecisions(s.approvals),review_feedback:step.agent==="writing_synthesizer"?history.map(x=>x.output_text):[]});
 const task=modelInstruction(step,rulebook,projectRules,source,handoff,s.run.instructions);
 const originalProduction=!s.run.source_version_id && ["idea_to_publish","idea_to_publish_audio","writing","song_video","song_video_publish"].includes(s.run.workflow);
 const editorialAuthority=originalProduction ? "\nYou are developing an original commissioned work. Within the authorised stage, the assigned specialist chooses the strongest editorial and staging options. Suggestions from earlier agents are advisory, not creator mandates. The creator brief and exact hook take precedence over additions by previous agents. Do not ask the creator to choose between draft variants." : "";
 const editingText=revisionSource || manuscript || original;
 const attachment=step.studio==="writing" && editingText ? "\n\nBEGIN EXACT MANUSCRIPT\n"+editingText+"\nEND EXACT MANUSCRIPT" : "";
 const songWorkflow=["idea_to_publish_audio","song_video","song_video_publish"].includes(s.run.workflow);
 const songDirection=songWorkflow && step.key==="writing_draft" ? "\nFor a commissioned original at writing_draft, the saved idea is the source and this stage creates the first unreviewed lyric sheet. No existing manuscript or lyric-editing mode selection is required. Write the complete first draft requested by the brief. A quoted hook can recur across developed verses and refrains. A short target duration is flexible when the brief permits it. Keep arrangement packaging for audio_direction." : "";
 const sunoPackage=songWorkflow && step.key==="audio_direction" ? "\nPreserve the reviewed lyric verbatim. Return separate Suno lyrics and style fields. The lyrics field must fit 5000 characters including bracketed arrangement and performance cues throughout. A provider job, funded quote, generated recording, listening approval and visual timings come later. The reviewed manuscript is the prerequisite for this text-only stage. Match the explicit genre, voices and project palette. Include only supported optional settings." : "";
 const deliverable={
   writing_critic:"Return line-specific critique of the supplied manuscript. Quote the lyric and explain the issue. Your entire deliverable is the critique.",
   writing_editor:"Return focused editorial recommendations for the current manuscript.",
   language_auditor:"Return the language audit with exact evidence from the current manuscript.",
   writing_author:"Return the complete first working manuscript.",
   writing_proofreader:"Return the complete proofread manuscript.",
   writing_synthesizer:"Return the complete revised manuscript."
 }[step.agent]||"";
 if(songWorkflow && ["audio_direction","audio_select_tool"].includes(step.key)){
   if(!manuscript)throw Error("A reviewed manuscript is required for music direction");
   const audioInputs=inputs.filter(row=>row.stage==="writing_review" || row.stage==="audio_direction");
   return modelInstruction(step,rulebook,projectRules,manuscript,JSON.stringify(audioInputs),s.run.instructions)+sunoPackage+
     "\nPrepare the requested text deliverable now. Audio selection names the provider and one planned operation. Credit approval applies to submission later. Do not claim a recording, inspection, spend or runtime verification.";
 }
 return task+editorialAuthority+songDirection+sunoPackage+"\n"+deliverable+"\nThe backend has already retrieved the project and stage state above. For a new work the saved brief authorizes an original draft. Treat generated manuscripts as working versions. Use the exact manuscript above for editorial tasks. Complete only your assigned stage. Return status complete with the actual deliverable, or blocked with the missing prerequisite in reason. Never mark a request for input complete."+attachment;

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
// The review and corresponding proof are archived together by the retry transaction.
async function priorLyricReviews(token, runId){
 const reviews=await rest(token,"production_step_attempts",{
   run_id:"eq."+runId,step_key:"eq.writing_review",output_text:"ilike.VERDICT: REPAIR*",order:"attempt_number.desc",limit:"3"
 });
 if(!reviews.length)return [];
 const proofs=await rest(token,"production_step_attempts",{
   run_id:"eq."+runId,step_key:"eq.writing_proofread",status:"eq.passed",
   recorded_at:"in.("+reviews.map(item=>item.recorded_at).join(",")+")"
 });
 return reviews.map(review=>({round:review.attempt_number,findings:review.output_text,
   manuscript:proofs.find(proof=>proof.recorded_at===review.recorded_at)?.output_text||null}));
}

function draftCandidates(rounds){
 const distinct=new Map();
 for(const row of rounds){
   if(row.manuscript?.trim() && !distinct.has(row.manuscript))distinct.set(row.manuscript,row);
 }
 return [...distinct.values()];
}

async function jointLyricChoice(s, rounds, rulebook, projectRules){
 const drafts=draftCandidates(rounds);
 if(!drafts.length)throw Error("The reviewed lyrics are unavailable for joint selection");
 const ids=drafts.map(row=>String(row.round));
 const common="Choose among these existing reviewed manuscripts for the requested song. Rank acceptable drafts best first. Exclude only drafts that violate a binding creator requirement. Include an empty ranking if none can be used. Weigh sung cadence, chorus movement, and the unresolved findings. Do not ask for another rewrite.\n"+JSON.stringify({brief:s.run.instructions,projectRules,rulebook,drafts});
 const writer=await runText("As the lyric writer: "+common,null,false,true,ids);
 const reviewer=await runText("As the independent reviewer deciding the strongest draft together with the writer: "+common+"\nWriter ballot: "+JSON.stringify(writer.vote),null,false,true,ids);
 const eligible=reviewer.vote.ranking.filter(id=>writer.vote.ranking.includes(id));
 if(!eligible.length)throw Error("Writer and reviewer identified no mutually eligible manuscript: "+reviewer.vote.reason.slice(0,160));
 // Combine both rankings. An equal total goes to the writer's first preference.
 eligible.sort((a,b)=>{
   const difference=writer.vote.ranking.indexOf(a)+reviewer.vote.ranking.indexOf(a)-writer.vote.ranking.indexOf(b)-reviewer.vote.ranking.indexOf(b);
   return difference||writer.vote.ranking.indexOf(a)-writer.vote.ranking.indexOf(b);
 });
 const selected=drafts.find(row=>String(row.round)===eligible[0]);
 return {text:"JOINT SELECTION: reviewed draft "+selected.round+"\nWriter: "+writer.vote.reason+"\nReviewer: "+reviewer.vote.reason,
   provider:"openai-responses",model:reviewer.model,selection:{check:"writer_reviewer_selection",selected_review_round:selected.round,
     selected_manuscript:selected.manuscript,review_rounds:rounds.map(row=>({round:row.round,findings:row.findings})),
     writer:{...writer.vote,response_id:writer.response_id},reviewer:{...reviewer.vote,response_id:reviewer.response_id}}};
}

async function runText(prompt,imageDataUrl=null,isReview=false,revision=false,ballotIds=null,songSections=null){

 const secret=Deno.env.get("OPENAI_API_KEY"),model=revision?(Deno.env.get("CBTED_EDITORIAL_REPAIR_MODEL")||"gpt-5.4-mini"):Deno.env.get("CBTED_TEXT_MODEL");
 if(!secret||!model)throw Error("Text provider is not configured");
 const schema=songSections ? {type:"object",additionalProperties:false,properties:{
   style:{type:"string"},cues:{type:"array",items:{type:"object",additionalProperties:false,properties:{section:{type:"integer"},direction:{type:"string"}},required:["section","direction"]}}
 },required:["style","cues"]} : ballotIds ? {type:"object",additionalProperties:false,properties:{ranking:{type:"array",items:{type:"string",enum:ballotIds}},reason:{type:"string"}},required:["ranking","reason"]} : isReview
  ? {type:"object",additionalProperties:false,properties:{verdict:{type:"string",enum:["PASS","REPAIR","BLOCKED"]},findings:{type:"string"}},required:["verdict","findings"]}
  : {type:"object",additionalProperties:false,properties:{status:{type:"string",enum:["complete","blocked"]},artifact:{type:"string"},reason:{type:"string"}},required:["status","artifact","reason"]};
 const result=await requestJSON("https://api.openai.com/v1/responses",
 {Authorization:"Bearer "+secret,"content-type":"application/json"},"POST",
 {model,store:false,text:{format:{type:"json_schema",name:"stage_result",strict:true,schema}},input:[{role:"user",content:[{type:"input_text",text:prompt},...(imageDataUrl?[{type:"input_image",image_url:imageDataUrl,detail:"high"}]:[])]}],max_output_tokens:8000});
 if(result.status!=="completed")throw Error("Text provider did not complete");
 const text=result.output?.flatMap(x=>x.content||[]).filter(x=>x.type==="output_text").map(x=>x.text).join("\n")||"";
 if(!text.trim())throw Error("Text provider returned no content");
 const stage=JSON.parse(text);
 if(songSections){
   const sections=[...songSections],used=new Set();
   if(!stage.style?.trim() || stage.style.trim().length>1000 || !stage.cues?.length)throw Error("Music direction requires a separate style field and arrangement cues");
   for(const cue of stage.cues){
     if(!Number.isInteger(cue.section)||cue.section<0||cue.section>=sections.length||used.has(cue.section)||!cue.direction?.trim()||/[\[\]\r\n]/.test(cue.direction))throw Error("Invalid music cue or section");
     sections[cue.section]="["+cue.direction.trim()+"]\n"+sections[cue.section];
     used.add(cue.section);
   }
   const lyrics=sections.join("\n\n");
   if(lyrics.length>5000)throw Error("Arranged lyrics exceed the Suno lyrics limit");
   return {text:"SUNO LYRICS\n"+lyrics+"\n\nSUNO STYLE\n"+stage.style.trim(),provider:"openai-responses",model,response_id:result.id};
 }
 if(ballotIds){
   if(!stage.reason?.trim()||!Array.isArray(stage.ranking)||new Set(stage.ranking).size!==stage.ranking.length||stage.ranking.some(id=>!ballotIds.includes(id)))throw Error("Invalid editorial ballot");
   return {vote:stage,model,response_id:result.id};
 }
 if(isReview){
  if(!stage.findings?.trim()||!["PASS","REPAIR"].includes(stage.verdict))throw Error("Review lacks required input: "+String(stage.findings||"").slice(0,230));
  return {text:"VERDICT: "+stage.verdict+"\n"+stage.findings,provider:"openai-responses",model,response_id:result.id};
 }
 if(stage.status!=="complete" || !stage.artifact?.trim() )throw Error("Stage did not produce a deliverable: "+String(stage.reason||"empty artifact").slice(0,230));
 return {text:stage.artifact,provider:"openai-responses",model,response_id:result.id};
}
async function runImage(prompt,user,project,token,rules){
 const setting=rules.find(r=>r.scope==="visual"&&r.rule_key==="image_generation_settings"&&r.is_locked);
 const options=setting?JSON.parse(setting.body):{};
 const secret=Deno.env.get("OPENAI_API_KEY"),model=Deno.env.get("CBTED_IMAGE_MODEL") || (options.model==="gpt-image-2" ? options.model : null);
 if(!secret||!model)throw Error("Image provider is not configured");
 const size=options.size || Deno.env.get("CBTED_IMAGE_SIZE")||"1536x864";
 const {width,height}=parseImageSize(size);
 const allAssets=await rest(token,"assets",{project_id:"eq."+project,limit:"200"});
 const references=allAssets.filter(a=>["reference","character_reference","style_reference","input_reference"].includes(a.asset_role)&&["image/png","image/jpeg","image/webp"].includes(a.mime_type));
 if(references.length>16)throw Error("More than 16 reference images: select a smaller project reference set");
 if(options.reference_ids){
  const ids=options.reference_ids;
  if(!Array.isArray(ids)||ids.length>16||!ids.every(id=>UUID.test(id)))throw Error("Invalid project reference selection");
  const selected=ids.length?await rest(token,"assets",{id:"in.("+ids.join(",")+")"}):[];
  if(selected.length!==new Set(ids).size||selected.some(a=>a.asset_role!=="character_reference"))throw Error("Required character reference is unavailable");
  for(const item of selected)if(!references.some(a=>a.id===item.id))references.push(item);
 }
 if(references.length>16)throw Error("Select at most 16 image references");
 const images=[];for(const ref of references)images.push({image_url:await privateImageData(token,ref)});
 const result=await requestJSON("https://api.openai.com/v1/images/"+(images.length?"edits":"generations"),
 {Authorization:"Bearer "+secret,"content-type":"application/json"},"POST",
 {...(images.length?{images}:{}),model,prompt:prompt.slice(0,30000),size,...(options.quality==="low"?{quality:"low"}:{}),n:1,output_format:"png"});
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
function configuredRunId(){
 const value=Deno.env.get("CBTED_PAID_RUN_ID")?.trim();
 return value && UUID.test(value) ? value : null;
}
// Bring the owner's selected recording and its measured timing into the visual brief.
async function readSoundtrackBrief(token, state) {
 const generated = state.steps.find(step => step.step_key === "audio_generate" && step.status === "passed");
 if (!generated?.asset_id || !state.run.source_version_id) return null;
 const [handoffs, assets] = await Promise.all([
  rest(token, "handoffs", {
   project_id: "eq." + state.run.project_id, source_version_id: "eq." + state.run.source_version_id,
   asset_id: "eq." + generated.asset_id, to_studio: "eq.visual",
   "payload->>run_id": "eq." + state.run.id, "payload->>owner_selected_for_video": "eq.true",
   select: "id,payload", order: "updated_at.desc", limit: "1"
  }),
  rest(token, "assets", { project_id: "eq." + state.run.project_id, id: "eq." + generated.asset_id, select: "metadata,duration_ms", limit: "1" })
 ]);
 const value = handoffs[0]?.payload;
 if (!value) return null;
 const asset = assets[0], analysis = value.analysis;
 if (!asset || !UUID.test(value.selected_full_song_id) ||
     asset.metadata?.provider_recording_id !== value.selected_full_song_id ||
     analysis?.audio_id !== value.selected_full_song_id || value.lyric_alignment?.audio_id !== value.selected_full_song_id ||
     !Number.isFinite(asset.duration_ms) || asset.duration_ms <= 0) {
  throw Error("The visual handoff does not match the reviewed full-length soundtrack.");
 }
 const beats = Array.isArray(analysis.beats) ? analysis.beats : [];
 const scenes = Array.isArray(value.proposed_scenes) ? value.proposed_scenes : [];
 const words = Array.isArray(value.lyric_alignment.words) ? value.lyric_alignment.words : [];
 return { asset_id: generated.asset_id, song_id: value.selected_full_song_id, duration_seconds: asset.duration_ms / 1000,
  bpm: analysis.bpm, aspect_ratio: value.aspect_ratio, reference_ids: (value.reference_ids || []).filter(id => UUID.test(id)).slice(0,32),
  beat_times_seconds: beats.filter(b => Number.isFinite(b?.time_s)).slice(0,4000).map(b => b.time_s),
  lyric_cues: words.filter(w => w?.success && Number.isFinite(w.start_s) && Number.isFinite(w.end_s)).slice(0,1500)
   .map(w => [w.start_s,w.end_s,String(w.word).slice(0,120)]),
  scenes: scenes.slice(0,100).map(s => ({start_s:s.start_s,end_s:s.end_s,title:String(s.title || "").slice(0,160),direction:String(s.direction || "").slice(0,1200)})) };
}
async function reviewSoundtrack(token,s,step,rulebook,projectRules){
 const generated=s.steps.find(x=>step.depends_on.includes(x.step_key) && x.kind==="audio" && x.status==="passed");
 if(!generated?.asset_id)throw Error("Approved soundtrack asset is missing");
 const [asset]=await rest(token,"assets",{id:"eq."+generated.asset_id,project_id:"eq."+s.run.project_id,limit:"1"});
 if(!asset?.storage_path)throw Error("Private soundtrack was not found in this project");
 const secret=Deno.env.get("OPENAI_API_KEY");
 if(!secret)throw Error("Audio inspection provider is not configured");
 const path=asset.storage_path.split("/").map(encodeURIComponent).join("/");
 const response=await fetch(ROOT+"/storage/v1/object/authenticated/cbted-project-assets/"+path,{headers:{apikey:key(),Authorization:"Bearer "+token}});
 const audio=await readReviewAudio(response,asset.mime_type);
 const brief={instructions:s.run.instructions,direction:s.steps.find(x=>x.step_key==="audio_direction" && x.status==="passed")?.output_text,manuscript:s.steps.find(x=>x.step_key==="writing_review" && x.status==="passed")?.evidence?.selected_manuscript || s.steps.find(x=>x.step_key==="writing_proofread" && x.status==="passed")?.output_text};
 return inspectAudio({audio,brief,rules:rulebook+"\n"+projectRules,assetId:asset.id,model:Deno.env.get("CBTED_AUDIO_REVIEW_MODEL")||"gpt-audio-1.5",request:body=>requestJSON("https://api.openai.com/v1/chat/completions",{Authorization:"Bearer "+secret,"content-type":"application/json"},"POST",body)});
}
async function executeOne(token,user,s,delegatedOperation=null){
 const mutate=delegatedOperation || ((name,params)=>rpc(token,name,params));
 if(Deno.env.get("CBTED_ALLOW_PAID_GENERATION")!=="true" && configuredRunId()!==s.run.id)throw Error("Paid model execution is disabled");
 const cap=Number(Deno.env.get("CBTED_MAX_PAID_STEPS_PER_RUN")||0);
 if(!Number.isInteger(cap)||cap<1||cap>200)throw Error("Set an explicit safe CBTED_MAX_PAID_STEPS_PER_RUN (1..200)");
 const attempted=s.steps.reduce((n,x)=>n+(x.attempt_number||0),0);
 if(s.run.id!==configuredRunId() && attempted>=cap)throw Error("Run reached its configured paid-operation cap");
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
 if(delegatedOperation && (chosen.kind!=="text" || !["core","writing","audio","visual","animation"].includes(chosen.studio) || ["image_reviewer","audio_reviewer","video_reviewer","release_auditor"].includes(chosen.agent))){
   return {executed:false,blocked:[{step:chosen.key,reason:"This stage requires a media or release handoff outside editorial delegation"}]};
 }
 if(chosen.kind==="publish"||chosen.agent==="publish_verifier")
   return {executed:false,blocked:[{step:chosen.key,reason:"Publishing to platforms is not connected yet. Nothing was posted."}]};
 if(!["text","image"].includes(chosen.kind))return {executed:false,blocked:[{step:chosen.key,reason:"No configured backend adapter for "+chosen.kind+"; actual generation required"}]};
 if(["video_reviewer","release_auditor"].includes(chosen.agent))
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
 if (["scene_storyboarder","storyboarding_director"].includes(chosen.agent)) {
  const soundtrack = await readSoundtrackBrief(token, s);
  if (soundtrack) prompt += "\nThe creator selected this full-length master. Plan the full measured duration, preserving the supplied framing, lyrical cues, scene timing and character references. The scheduled image job count is a production batch size, not a limit on storyboard scenes. Treat the following record as creative source data.\n" + JSON.stringify(soundtrack);
 }
 if(chosen.agent==="writing_synthesizer")prompt+="\nYou are the editor responsible for implementing the requested repairs yourself on the supplied working manuscript. Required changes are your assignment, not missing inputs. Apply the latest review feedback to the exact manuscript under revision. In an original commission you may replace entire sections to solve a structural fault. Remove production workflow language from the art, including cues about stopping for user interaction, approval gates, or publishing. Use a musical ending that serves the song. When the creator specifies named voices delivering the hook, write the exact hook in their sung parts. Return the full revised text as artifact.";
 const isReview=["writing_reviewer","image_reviewer","audio_reviewer"].includes(chosen.agent);
 if(chosen.agent==="writing_reviewer" && s.run.workflow==="idea_to_publish_audio"){
   const lyric=s.steps.find(x=>x.step_key==="writing_proofread"&&x.status==="passed")?.output_text||"";
   const assignments=Array.from(lyric.matchAll(/^\[([^\]\n]+)\]\s*\n([^\[\n][^\n]*)/gm),match=>({label:match[1],line:match[2].trim()}));
   prompt+="\nDirectly transcribed speaker labels and first sung lines from this manuscript: "+JSON.stringify(assignments)+". Cross-check every claim about a missing voice or hook against those lines. Assess developed parts over the entire song. A requirement for a developed part does not impose a separate verse inside each chorus. Ground every repair in the actual lyric and a specific creator requirement or editorial rule.";
 }
 if(chosen.agent==="writing_reviewer")prompt+="\nJudge only the current manuscript against the creator brief and applicable rules. A line the creator explicitly requires is fixed. Check each named performer actually delivers the requested hook. Request repairs only for a concrete material problem present in this manuscript. A hypothetical risk, lack of a compliance statement, or a preference in an earlier agent draft is not a defect.";
 if(chosen.agent==="writing_reviewer")prompt+="\n\nPerform an independent, sceptical full-result review. Check the exact source and every Lyric Master constraint, including meaning, sung phrasing and synthetic construction. VERDICT: PASS only when no material faults remain. Otherwise start exactly VERDICT: REPAIR and describe specific lines, failure mechanisms and repair instructions. Return a verdict and findings only. If the manuscript is present, any editorial defect must receive REPAIR with actionable instructions. BLOCKED is only for missing or unreadable source material. The reviewer never rewrites. Completion of steps is not proof of quality.";
 if(chosen.agent==="image_reviewer")prompt+="\nInspect the attached generated image against its approved visual prompt, creator brief and visual rules. Return PASS when the image meets the requirements, REPAIR with specific visible defects when it does not, or BLOCKED when the image cannot be inspected.";
 const imageData=chosen.agent==="image_reviewer"
   ?await loadActualImage(token,s.run.project_id,s.steps.find(x=>x.step_key==="visual_generate_"+chosen.key.split("_").pop()))
   :null;
 // A creator may supply an approved replacement after the first draft. Import that
 // exact manuscript once at rewrite; the ordinary proofreader and reviewer still run.
 let approvedReplacement=null;
 const prerequisiteKey=chosen.key==="writing_proofread"?"writing_rewrite":"writing_draft";
 const prerequisite=s.steps.find(item=>item.step_key===prerequisiteKey && item.status==="passed");
 if(["writing_rewrite","writing_proofread"].includes(chosen.key) && s.run.workflow==="idea_to_publish_audio" && src?.content?.trim() && Date.parse(src.created_at)>Date.parse(prerequisite?.finished_at||"")){
   const [decisions,imports]=await Promise.all([
     rest(token,"approvals",{project_id:"eq."+s.run.project_id,source_version_id:"eq."+src.id,select:"decision",order:"created_at.desc,id.desc",limit:"1"}),
     rest(token,"production_step_attempts",{run_id:"eq."+s.run.id,"evidence->>imported_source_version_id":"eq."+src.id,select:"id",limit:"1"})
   ]);
   if(decisions[0]?.decision==="approved" && !imports.length)approvedReplacement=src;
 }
 if(approvedReplacement && chosen.key==="writing_proofread"){
   // The replacement arrived after the last rewrite. Proofread its actual text.
   const input={...s,steps:s.steps.map(item=>item.step_key==="writing_rewrite"?{...item,output_text:src.content}:item)};
   prompt=takePrompt(input,chosen,rulebook,original,projectRules);
 }
 await mutate("cbted_claim_production_step",{p_run:s.run.id,p_step:chosen.key});
 try{
   let result;
   const songReview=chosen.key==="writing_review" && s.steps.some(item=>item.step_key==="writing_proofread");
   const prior=songReview?await priorLyricReviews(token,s.run.id):[];
   if(prior.length>=3){
     result=await jointLyricChoice(s,prior,rulebook,projectRules);
   }else if(approvedReplacement && chosen.key==="writing_rewrite"){
     result={text:approvedReplacement.content,provider:"project-source",model:null};
   }else if(chosen.key==="audio_direction" && ["idea_to_publish_audio","song_video","song_video_publish"].includes(s.run.workflow)){
     const decision=s.steps.find(item=>item.step_key==="writing_review" && item.status==="passed");
     const manuscript=decision?.evidence?.selected_manuscript || s.steps.find(item=>item.step_key==="writing_proofread" && item.status==="passed")?.output_text;
     if(!manuscript?.trim())throw Error("The reviewed song is missing");
     const sections=manuscript.trim().split(/\n\s*\n/);
     result=await runText(prompt+"\nWrite a concrete separate Suno style and musical cues for the numbered sections. Use zero-based section numbers. Return only the cues and style; the server inserts cues into the exact lyric.\n"+JSON.stringify(sections),null,false,false,null,sections);
   }else if(chosen.agent==="audio_reviewer"){
     result=await reviewSoundtrack(token,s,chosen,rulebook,projectRules);
   }else result=chosen.kind==="text"?await runText(prompt,imageData,isReview,["writing_synthesizer","writing_reviewer","writing_proofreader"].includes(chosen.agent) && s.attempts.some(x=>x.step_key==="writing_review" && x.output_text?.startsWith("VERDICT: REPAIR"))):await runImage(
    other.find(x=>x.step_key==="visual_prompt_"+chosen.key.split("_").pop())?.output_text||prompt,user,s.run.project_id,token,rules);
   if(songReview && !result.selection && /^VERDICT:\s*REPAIR/i.test(result.text)){
     const proof=s.steps.find(item=>item.step_key==="writing_proofread" && item.status==="passed");
     const current={round:actual.attempt_number+1,manuscript:proof?.output_text,findings:result.text};
     const protectedSource=s.run.source_version_id && (s.steps.some(item=>item.evidence?.imported_source_version_id===s.run.source_version_id) || s.attempts.some(item=>item.evidence?.imported_source_version_id===s.run.source_version_id));
      const normalize=text=>String(text||"").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
      const quotedLines=text=>Array.from(String(text||"").matchAll(/["“]([^"”\n]{15,240})["”]/g),m=>normalize(m[1])).filter(line=>line.split(" ").length>=5);
      const priorQuotes=new Set(quotedLines(prior[0]?.findings));
      const retainedFault=quotedLines(result.text).some(line=>priorQuotes.has(line) && normalize(current.manuscript).includes(line) && !normalize(s.run.instructions).includes(line));
     if(prior.length>=2 || protectedSource || retainedFault || prior.some(row=>row.manuscript===current.manuscript)){
       const findingsId=result.response_id;
       try{
         result=await jointLyricChoice(s,[current,...prior],rulebook,projectRules);
         result.selection.last_review_response_id=findingsId;
       }catch(error){
         await mutate("cbted_finish_production_step",{p_run:s.run.id,p_step:chosen.key,p_result:"failed",p_text:current.findings,
           p_evidence:{provider:result.provider,model:result.model,response_id:findingsId,selection_error:String(error.message||error).slice(0,300)}});
         return {executed:true,step:chosen.key,kind:chosen.kind,review_failed:true,revision_cycle_reopened:false,reason:"Joint draft selection requires attention: "+String(error.message||error).slice(0,200)};
       }
     }
   }
   const reviewFailed=isReview&&!result.selection&&!reviewPassed(result.text);
   await mutate("cbted_finish_production_step",{
    p_run:s.run.id,p_step:chosen.key,p_result:reviewFailed?"failed":"passed",
    p_text:result.text||null,p_asset:result.asset_id||null,
    p_evidence:{provider:result.provider,model:result.model,response_id:result.response_id||null,...(result.reviewed_asset_id?{reviewed_asset_id:result.reviewed_asset_id}:{}),...(approvedReplacement?{imported_source_version_id:approvedReplacement.id,check:chosen.key==="writing_proofread"?"approved_replacement_proofread":"approved_replacement_imported"}:{check:"provider_returned_and_recorded"}),...result.selection}
   });
   const hasRewriteStage=s.steps.some(step=>step.step_key==="writing_rewrite");
   if(reviewFailed && chosen.key==="writing_review" && hasRewriteStage && /^VERDICT:\s*REPAIR/i.test(result.text)){
      try{
        await mutate("cbted_retry_production_step",{p_run:s.run.id,p_step:chosen.key});
        return {executed:true,step:chosen.key,kind:chosen.kind,review_failed:true,revision_cycle_reopened:true};
      }catch(e){return {executed:true,step:chosen.key,kind:chosen.kind,review_failed:true,revision_cycle_reopened:false,reason:String(e.message||e).slice(0,240)};}
    }
    return {executed:true,step:chosen.key,kind:chosen.kind,asset_id:result.asset_id||null,review_failed:reviewFailed};
 }catch(e){
   await mutate("cbted_finish_production_step",{p_run:s.run.id,p_step:chosen.key,p_result:"failed",p_evidence:{reason:String(e.message||e).slice(0,300)}}).catch(()=>{});
   throw e;
 }
}
async function delegatedNext(body){
 const runId=requiredUUID(body.run_id,"run");
 if(typeof body.credential!=="string" || !/^[a-f0-9]{64}$/.test(body.credential))throw Error("Invalid run delegation");
 const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!service)throw Error("Delegation service is unavailable");
 const operation=(args)=>requestJSON(ROOT+"/rest/v1/rpc/cbted_delegated_stage",dbHeaders(service),"POST",{p_run:runId,p_secret:body.credential,...args});
 const scope=await operation({p_action:"scope"});
 const snapshot=await state(service,runId);
 if(snapshot.run.project_id!==scope.project_id)throw Error("Run delegation scope changed");
 let ticket=null;
 async function mutate(name,params){
  if(params.p_run!==runId)throw Error("Mismatched run");
  const step=params.p_step;
  if(name==="cbted_claim_production_step"){ticket=await operation({p_action:"claim",p_step:step});return;}
  if(name==="cbted_finish_production_step"){await operation({p_action:"finish",p_step:step,p_ticket:ticket,p_result:params.p_result,p_text:params.p_text||null,p_evidence:params.p_evidence});return;}
  if(name==="cbted_retry_production_step"){await operation({p_action:"retry",p_step:step});return;}
  throw Error("Unsupported operation");
 }
 return executeOne(service,scope.owner_id,snapshot,mutate);
}
Deno.serve(async(request)=>{
 if(request.method==="OPTIONS")return json({},204);
 const path=new URL(request.url).pathname.split("/").pop();
 if(request.method==="GET"&&path==="health")return json({name:"CBTeD Orchestrator",status:"online",global_provider_execution_enabled:Deno.env.get("CBTED_ALLOW_PAID_GENERATION")==="true",provider_execution_enabled:Deno.env.get("CBTED_ALLOW_PAID_GENERATION")==="true" || Boolean(configuredRunId())});
 if(request.method!=="POST")return json({error:"POST required"},405);
 try{

  if(Number(request.headers.get("content-length")||0)>300000)return json({error:"Body too large"},413);
  const body=await request.json();
  if(!body||typeof body!=="object"||Array.isArray(body))throw Error("Invalid request");
  if(path==="delegated-next"){
   try{return json(await delegatedNext(body));}
   catch(e){return json({error:String(e.message||"Delegated continuation unavailable").slice(0,320)},400);}
  }
  const user=await identity(request);
  if(path==="delegation-enable" || path==="delegation-revoke"){
   const run_id=requiredUUID(body.run_id,"run");
   const credential=path==="delegation-enable" ? Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("") : null;
   await requestJSON(ROOT+"/rest/v1/rpc/cbted_set_run_delegation",dbHeaders(user.token),"POST",{p_run:run_id,p_secret:credential});
   return json(credential?{run_id,credential}:{run_id,revoked:true});
  }
  if(path==="plan"){
   const plan=preview(body);
   if(body.intent!=="execute")return json({...plan,created:false,executed:false});
   if(!plan.steps.length)throw Error("No executable work in plan");
   await requireProject(user.token,body.project_id);
   const instructions=String(body.instructions||"").trim();
   if(!instructions||instructions.length>20000)throw Error("Instructions required (max 20,000 characters)");
   if(["writing_critique","writing_suggestions","writing_line_edit","writing_rewrite"].includes(plan.workflow)&&!body.source_version_id)throw Error("Exact existing source version required");
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
   if(body.result==="passed"&&steps[0].kind==="publish")throw Error("Only the publishing service can confirm a post");
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
