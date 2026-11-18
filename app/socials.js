import {createClient} from "https://esm.sh/@supabase/supabase-js@2.118.0";
import {loadPublicConfig} from "./config.js";
import {normaliseSocialHandle,parseSocialProfileInput,suggestedSocialProfiles,safeConsentUrl} from "./social-connect.mjs";

const $=id=>document.getElementById(id);
const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el};
let config,db,profileSuggestions=[],providerReady={};
const status=(message,isError=false)=>{$("social-status").textContent=message;$("social-status").classList.toggle("error",isError)};
async function session(){
 const {data,error}=await db.auth.getSession();
 if(error)throw error;
 if(!data.session?.access_token)throw Error("Sign in at CBTeD Studios first, then return to this page.");
 const {data:userData,error:userError}=await db.auth.getUser();
 if(userError||!userData.user)throw Error("Your CBTeD session has expired. Please sign in again.");
 return data.session.access_token;
}
async function socialRequest(path,body){
 const token=await session();
 const url=config.url+"/functions/v1/cbted-social-connect/"+path;
 const res=await fetch(url,{method:body?"POST":"GET",
  headers:{apikey:config.publishableKey,Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},
  ...(body?{body:JSON.stringify(body)}:{})});
 let reply;try{reply=await res.json()}catch{throw Error("Social connection service is not available yet.");}
 if(!res.ok)throw Error(reply.error||"Social platform could not complete the request.");
 return reply;
}
async function connect(provider,handle,button){
 button.disabled=true;
 try{
  const result=await socialRequest("start",{provider,handle:handle||""});
  if(!safeConsentUrl(result.authorize_url))throw Error("The platform did not return a recognised secure authorisation page.");
  $("connection-status").textContent="Opening "+provider+"'s official sign-in and permission screen.";
  window.location.assign(result.authorize_url);
 }catch(e){
  $("connection-status").textContent=String(e.message||e);
  button.disabled=false;
 }
}
function render(){
 const list=$("social-profiles");list.replaceChildren();
 for(const profile of profileSuggestions){
  const section=node("section");section.className="panel";
  section.append(node("h3",profile.label));
  const inputLabel=node("label","Profile username or URL for "+profile.label+" ");
  const input=node("input");input.type="text";input.maxLength=320;
  input.autocomplete="off";input.spellcheck=false;input.value=profile.handle||"";
  input.setAttribute("aria-label",profile.label+" username or profile URL");
  inputLabel.append(input);section.append(inputLabel);
  const note=node("p","Suggested profile address only. Account not verified.");note.className="hint";section.append(note);
  const link=node("a","Open suggested "+profile.label+" profile");
  link.href=profile.address;link.target="_blank";link.rel="noopener noreferrer";
  section.append(link);
  const actions=node("div");actions.className="actions";
  const button=node("button","Connect "+profile.label);button.type="button";button.disabled=!providerReady[profile.id];
  actions.append(button);section.append(actions);
  input.addEventListener("change",()=>{
   try{
    const supplied=parseSocialProfileInput(input.value);
    if(supplied.provider&&supplied.provider!==profile.id)throw Error("That link belongs to a different social platform.");
    if(supplied.address){profile.handle=supplied.handle||"";profile.address=supplied.address;}
    else {const proposed=suggestedSocialProfiles(supplied.handle).find(x=>x.id===profile.id);
     profile.handle=proposed.handle;profile.address=proposed.address;}
    link.href=profile.address;input.value=profile.handle||profile.address;
    note.textContent="Suggested account address updated. Ownership is not verified until you connect.";
   }catch(e){note.textContent=String(e.message||e);input.focus();}
  });
  button.addEventListener("click",()=>connect(profile.id,profile.handle,button));
  list.append(section);
 }
 if(!Object.values(providerReady).some(Boolean)){
  const p=node("p","Official account connections are not enabled yet. These links are suggestions, not connected accounts.");
  p.className="hint";list.append(p);
 }
}
function preview(event){
 event.preventDefault();
 try{
  const input=$("common-handle").value;
  const parsed=parseSocialProfileInput(input);
  if(parsed.handle)profileSuggestions=suggestedSocialProfiles(parsed.handle);
  else {
   const label=parsed.provider?.[0].toUpperCase()+parsed.provider?.slice(1)||"Account";
   profileSuggestions=[{id:parsed.provider,label,handle:"",address:parsed.address}];
  }
  if(parsed.address){
   const chosen=profileSuggestions.find(p=>p.id===parsed.provider);
   chosen.address=parsed.address;
  }
  $("handle-note").textContent=parsed.address?
   "Profile address recognised. Please confirm that it is the account you own.":
   normaliseSocialHandle(input).spacingRemoved?
   "Spaces removed from the dictated username. Check each address carefully.":
   "Please check each suggested address before connecting.";
  render();
 }catch(e){$("handle-note").textContent=String(e.message||e);}
}
function actionButton(text,callback){
 const b=node("button",text);b.type="button";b.className="secondary";
 b.addEventListener("click",async()=>{
  b.disabled=true;
  try{await callback();await checkConnections();}
  catch(e){$("connection-status").textContent=String(e.message||e);b.disabled=false;}
 });
 return b;
}
function showConnections(list){
 const out=$("connected-accounts");out.replaceChildren();
 for(const c of list){
  const li=node("li");li.append(node("strong",c.provider+": "+(c.display_name||c.account_handle||c.remote_account_id)));
  const desc=node("p",c.status==="needs_confirmation"?
   "The platform returned this account. Confirm it is yours to finish linking.":
   c.status==="active"?"Connected. Posting permission is granted. Every new post will still need your approval.":
   c.status==="needs_permission"?"Connected, but the platform has not granted permission to publish.":
   c.status==="disconnected"?"Disconnected. CBTeD cannot post to this account.":"Connection status: "+c.status);
  desc.className="hint";li.append(desc);
  if(c.profile_url){const link=node("a","View authorised account");link.href=c.profile_url;link.target="_blank";link.rel="noopener noreferrer";li.append(link);}
  if(c.status==="needs_confirmation")li.append(actionButton("Confirm "+(c.display_name||"this account"),async()=>{
   const r=await socialRequest("confirm",{connection_id:c.id});
   $("connection-status").textContent=r.status==="active"?"Account connected successfully.":"Account confirmed, but publishing permission is not available.";
  }));
  if(c.status!=="disconnected")li.append(actionButton("Disconnect "+(c.display_name||c.provider),async()=>{
   if(!window.confirm("Disconnect this social account from CBTeD?"))return;
   await socialRequest("disconnect",{connection_id:c.id});
  }));
  out.append(li);
 }
 if(!list.length)out.append(node("li","No platform-authorised accounts yet."));
}
function showPostRequests(requests){
 const out=$("post-approvals");if(!out)return;
 out.replaceChildren();
 for(const p of requests){
  const li=node("li");
  li.append(node("span",(p.title||"Untitled video")+" – "+p.status+" ("+p.privacy+") "));
  if(p.status==="awaiting_approval"){
   li.append(actionButton("Approve this post",async()=>{
    await socialRequest("approve-post",{request_id:p.id,decision:"approved"});
    $("connection-status").textContent="Post approved in CBTeD. The actual publishing adapter is not yet enabled.";
   }));
   li.append(actionButton("Reject this post",async()=>{
    await socialRequest("approve-post",{request_id:p.id,decision:"rejected"});
   }));
  }
  out.append(li);
 }
 if(!requests.length)out.append(node("li","No pending post requests."));
}
async function checkConnections(){
 try{
  const result=await socialRequest("status");
  providerReady=result.providers||{};
  showConnections(result.connections||[]);
  showPostRequests(result.post_requests||[]);
  $("connection-status").textContent=result.available?
   "Your configured platforms are ready for official account authorisation. Select Connect.":
   "Awaiting CBTeD's platform application credentials and permissions. No account is linked by a guessed URL.";
 }catch(e){
  providerReady={};
  $("connection-status").textContent="Secure social account integration is not deployed or configured yet. Nothing has been linked.";
  $("connected-accounts").replaceChildren();
 }
 if(profileSuggestions.length)render();
}
async function initialise(){
 try{
  config=await loadPublicConfig();
  db=createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  await session();
  const callback=new URL(location.href).searchParams.get("social");
  status(callback==="review"?"Authorisation received. Confirm the account returned by the platform below.":
   callback==="expired"?"The connection link expired. Start the connection again.":
   callback==="cancelled"?"Account permission was declined or cancelled.":
   callback==="failed"?"Connection could not be verified. Nothing was linked.":
   "Signed in. Enter a username or account URL to start.");
  await checkConnections();
 }catch(e){status(String(e.message||e),true);}
}
$("handle-form").addEventListener("submit",preview);
await initialise();
