// Project-scoped publishing drafts. This UI NEVER sends a public social post.
// Actual destinations come only from the real signed-in OAuth connection service.
const $=id=>document.getElementById(id);
const element=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node};
export function attachProjectPublishing({db,config,getSessionToken,getProjectId}){
 const status=(message,error=false)=>{
  const n=$("publishing-project-status");n.textContent=String(message);n.classList.toggle("error",error);
 };
 async function call(path,body){
  const token=await getSessionToken();
  const resp=await fetch(config.url+"/functions/v1/cbted-social-connect/"+path,{
   method:body?"POST":"GET",
   headers:{Authorization:"Bearer "+token,apikey:config.publishableKey,...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  });
  let data;try{data=await resp.json()}catch{throw Error("Social provider service returned an invalid response");}
  if(!resp.ok)throw Error(data.error||"Social publishing action refused");
  return data;
 }
 function action(label,handler){
  const b=element("button",label);b.type="button";b.className="secondary";
  b.addEventListener("click",async()=>{
   b.disabled=true;
   try{await handler();await refresh();}
   catch(e){status(e.message||e,true);b.disabled=false;}
  });
  return b;
 }
 async function refresh(){
  const projectId=getProjectId();
  const clips=$("publish-asset"),accounts=$("publish-connection"),pending=$("publishing-project-requests");
  clips.replaceChildren();accounts.replaceChildren();pending.replaceChildren();
  const firstClip=element("option","Choose a saved project video");firstClip.value="";clips.append(firstClip);
  const firstAccount=element("option","Choose a verified account");firstAccount.value="";accounts.append(firstAccount);
  if(!projectId){status("Select a project to see connected accounts and pending posts.");return;}
  let connections,files;
  try{
   const result=await Promise.all([
    call("status"),
    db.from("assets").select("id,filename,mime_type").eq("project_id",projectId).order("created_at",{ascending:false}).limit(100)
   ]);
   connections=result[0];if(result[1].error)throw result[1].error;files=result[1].data||[];
  }catch(e){status("Publishing destinations unavailable: "+String(e.message||e),true);return;}
  for(const video of files)if(String(video.mime_type||"").startsWith("video/")){
   const option=element("option",video.filename||"Saved project video");option.value=video.id;clips.append(option);
  }
  for(const account of connections.connections||[])if(account.status==="active"&&account.post_permission){
   const option=element("option",account.provider+" · "+(account.display_name||account.account_handle||account.remote_account_id));
   option.value=account.id;accounts.append(option);
  }
  const requests=(connections.post_requests||[]).filter(p=>p.project_id===projectId);
  for(const post of requests){
   const li=element("li");
   li.append(element("strong",(post.title||"Untitled")+" · "+post.privacy+" · "+post.status));
   if(post.scheduled_at)li.append(element("p","Requested posting time: "+new Date(post.scheduled_at).toLocaleString()));
   if(post.status==="awaiting_approval"){
    li.append(action("Approve this post draft",async()=>{
     await call("approve-post",{request_id:post.id,decision:"approved"});
     status("The post is approved, but has not been sent to the platform.");
    }));
    li.append(action("Reject this post draft",async()=>{
     await call("approve-post",{request_id:post.id,decision:"rejected"});
     status("The post draft was rejected without publishing.");
    }));
   }
   if(post.status==="approved")li.append(element("p","Approved, awaiting an actual platform publishing adapter. No public post has been sent."));
   pending.append(li);
  }
  if(!requests.length)pending.append(element("li","No publishing requests have been created for this project."));
  status((clips.options.length-1)+" saved videos, "+(accounts.options.length-1)+" authorised destinations, "+requests.length+
   " post drafts. Publishing remains disabled pending real provider upload verification.");
 }
 async function prepare(event){
  event.preventDefault();
  const project_id=getProjectId(),asset_id=$("publish-asset").value,connection_id=$("publish-connection").value;
  if(!project_id||!asset_id||!connection_id)throw Error("Select a project, saved video and authorised destination");
  const title=$("publish-title").value.trim(),caption=$("publish-caption").value.trim();
  if(!title)throw Error("Enter a post title");
  const rawTime=$("publish-scheduled").value;
  const scheduled_at=rawTime?new Date(rawTime).toISOString():null;
  const response=await call("draft-post",{project_id,asset_id,connection_id,title,caption,
   privacy:$("publish-privacy").value,scheduled_at});
  status("Post draft "+response.request_id+" awaits your explicit approval. No platform was contacted for publishing.");
  await refresh();
 }
 $("project-publish-form").addEventListener("submit",async(event)=>{
  try{await prepare(event)}catch(e){status(String(e.message||e),true);}
 });
 $("refresh-publishing").addEventListener("click",()=>refresh());
 return {refresh};
}
