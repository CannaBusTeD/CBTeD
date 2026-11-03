import {createClient} from "https://esm.sh/@supabase/supabase-js@2.118.0";
import {loadPublicConfig} from "./config.js";
const $=id=>document.getElementById(id);
const message=(value,error=false)=>{const e=$("production-status");e.textContent=value;e.classList.toggle("error",error);};
const node=(tag,txt)=>{const e=document.createElement(tag);e.textContent=txt;return e;};
let db,config,session,activePreview=null;
const backend=path=>config.url+"/functions/v1/cbted-orchestrator/"+path;
async function signedIn(){
 const r=await db.auth.getSession();if(r.error)throw r.error;
 session=r.data.session;
 if(!session?.access_token)throw Error("Sign in to CBTeD Studios first, then return to the Production Controller.");
 return session.access_token;
}
async function call(path,body){
 const token=await signedIn();
 const res=await fetch(backend(path),{method:"POST",headers:{Authorization:"Bearer "+token,apikey:config.publishableKey,"content-type":"application/json"},body:JSON.stringify(body)});
 let data;try{data=await res.json();}catch{throw Error("The controller returned an invalid response");}
 if(!res.ok)throw Error(data.error||"Controller rejected this operation");
 return data;
}
async function dbQuery(request){
 const {data,error}=await request;if(error)throw error;return data;
}
async function projects(){
 await signedIn();
 const records=await dbQuery(db.from("projects").select("id,title").order("updated_at",{ascending:false}));
 const select=$("production-project");select.replaceChildren(node("option","Select a project"));select.firstChild.value="";
 for(const p of records){const option=node("option",p.title);option.value=p.id;select.append(option);}
 message(records.length?"Signed in. Select a project.":"No projects yet. Create one in CBTeD Studios.");
}
async function projectChanged(){
 activePreview=null;$("create-production").disabled=true;
 const project=$("production-project").value;
 $("production-source").replaceChildren(node("option","No saved source selected")) ;$("production-source").firstChild.value="";
 $("production-preview").replaceChildren();$("production-steps").replaceChildren();
 if(!project){$("production-runs").replaceChildren(node("option","No run selected"));return;}
 const [sources,versions]=await Promise.all([
  dbQuery(db.from("sources").select("id,title").eq("project_id",project)),
  dbQuery(db.from("source_versions").select("id,source_id,version_number,created_at").eq("project_id",project).order("created_at",{ascending:false}).limit(150))
 ]);
 const titles=Object.fromEntries(sources.map(x=>[x.id,x.title]));
 for(const v of versions){const option=node("option",(titles[v.source_id]||"Source")+" version "+v.version_number);option.value=v.id;$("production-source").append(option);}
 await loadRuns();
}
function input(){
 const instructions=$("production-instructions").value.trim();
 const body={project_id:$("production-project").value,source_version_id:$("production-source").value||undefined,
  workflow:$("production-workflow").value,instructions,
  image_count:Number($("production-images").value),video_count:Number($("production-videos").value)};
 if(!body.project_id||!instructions)throw Error("Select a project and enter your task instructions");
 if(!Number.isInteger(body.image_count)||body.image_count<1||body.image_count>20||!Number.isInteger(body.video_count)||body.video_count<1||body.video_count>20)
  throw Error("Image and clip counts must be between 1 and 20");
 return body;
}
async function preview(event){
 event.preventDefault();
 const body=input();
 const plan=await call("plan",{...body,intent:"plan"});
 const list=$("production-preview");list.replaceChildren();
 for(const s of plan.steps){
  const li=node("li",s.studio+": "+s.agent+" ("+s.key+")"+(s.approval_required?" - explicit approval required":""));
  list.append(li);
 }
 activePreview=JSON.stringify(body);
 $("create-production").disabled=false;
 message("Previewed "+plan.steps.length+" ordered stages. No production was registered or started.");
}
async function createRun(){
 const body=input();
 if(!activePreview||JSON.stringify(body)!==activePreview)throw Error("Inputs changed. Preview the updated plan before registering it.");
 const result=await call("plan",{...body,intent:"execute",request_id:crypto.randomUUID()});
 $("create-production").disabled=true;activePreview=null;
 await loadRuns(result.run_id);
 message("Registered "+result.steps+" stages. No agent has executed yet.");
}
async function loadRuns(selectId){
 const project=$("production-project").value;if(!project)return;
 const runs=await dbQuery(db.from("production_runs").select("id,workflow,status,created_at")
  .eq("project_id",project).order("created_at",{ascending:false}).limit(40));
 const selector=$("production-runs"),keep=selectId||selector.value;
 selector.replaceChildren(node("option","Select a production run"));selector.firstChild.value="";
 for(const r of runs){const label=r.workflow+" | "+r.status+" | "+new Date(r.created_at).toLocaleString();const option=node("option",label);option.value=r.id;selector.append(option);}
 if(runs.some(r=>r.id===keep))selector.value=keep;
 if(selector.value)await refresh();
}
async function refresh(){
 const id=$("production-runs").value;
 if(!id){$("run-state").textContent="No run selected.";$("production-steps").replaceChildren();return;}
 const r=await call("status",{run_id:id});
 $("run-state").textContent="Run "+r.run.workflow+" is "+r.run.status+". "+r.steps.filter(s=>s.status==="passed").length+" of "+r.steps.length+" stages completed.";
 const decisions={};for(const a of r.approvals||[])decisions[a.step_key]=a.decision;
 const list=$("production-steps");list.replaceChildren();
 for(const s of r.steps){
  const li=document.createElement("li");
  li.append(node("span",s.step_key+" ("+s.status+")"));
  if(s.approval_required&&s.status==="pending"){
   const decision=decisions[s.step_key]||"not approved";
   li.append(node("span"," | "+decision+" "));
   const button=node("button",decision==="approved"?"Revoke approval for "+s.step_key:"Approve "+s.step_key);
   button.type="button";button.className="secondary";
   button.addEventListener("click",async()=>{
    button.disabled=true;try{
     const next=decision==="approved"?"revoked":"approved";
     await call("approve",{run_id:id,step_key:s.step_key,decision:next,note:"Explicit action in CBTeD Production Controller"});
     await refresh();message("Recorded "+next+" for exactly "+s.step_key+".");
    }catch(e){message(e.message,true);button.disabled=false;}
   });
   li.append(button);
  }
  if(s.status==="failed")li.append(node("span"," | Failed. Earlier finished stages are preserved."));
  list.append(li);
 }
}
async function next(){
 const id=$("production-runs").value;if(!id)throw Error("Select a run first");
 const result=await call("execute-next",{run_id:id});
 $("execution-result").textContent=result.executed?
  "One stage executed: "+result.step+(result.review_failed?" (quality review requires repair)":""):
  "Nothing executed. "+(result.blocked||[]).slice(0,3).map(x=>x.step+": "+x.reason).join("; ");
 await refresh();
}
async function safe(fn){try{await fn();}catch(e){message(String(e.message||e),true);}}
async function init(){
 try{
  config=await loadPublicConfig();db=createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  await projects();
 }catch(e){message(String(e.message||e),true);}
}
$("production-form").addEventListener("submit",event=>safe(()=>preview(event)));
$("create-production").addEventListener("click",()=>safe(createRun));
$("production-project").addEventListener("change",()=>safe(projectChanged));
$("production-runs").addEventListener("change",()=>safe(refresh));
$("refresh-production").addEventListener("click",()=>safe(async()=>{await loadRuns();}));
$("run-next").addEventListener("click",()=>safe(next));
for(const id of ["production-source","production-workflow","production-images","production-videos","production-instructions"]){
 $(id).addEventListener("input",()=>{$("create-production").disabled=true;activePreview=null;});
}
await init();
