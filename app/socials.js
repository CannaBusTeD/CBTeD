import {createClient} from "https://esm.sh/@supabase/supabase-js@2.118.0";
import {loadPublicConfig} from "./config.js";
import {normaliseSocialHandle,suggestedSocialProfiles,safeConsentUrl} from "./social-connect.mjs";

const $=id=>document.getElementById(id);
const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el};
let config,db,profileSuggestions=[],linkingAvailable=false;
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
 const res=await fetch(url,{method:body?"POST":"GET",headers:{apikey:config.publishableKey,Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
 let reply;try{reply=await res.json()}catch{throw Error("Social connection service has not been deployed yet.");}
 if(!res.ok)throw Error(reply.error||"This social provider is not configured for CBTeD yet.");
 return reply;
}
async function connect(provider,handle,button){
 button.disabled=true;
 try{
  const result=await socialRequest("start",{provider,handle});
  if(!safeConsentUrl(result.authorize_url))throw Error("The platform did not return a recognised secure authorisation page.");
  $("connection-status").textContent="Opening "+provider+"'s official sign-in and permission screen.";
  window.location.assign(result.authorize_url);
 }catch(e){
  $("connection-status").textContent=String(e.message||e);
  button.disabled=false;
 }
}
function render(){
 const list=$("social-profiles");
 list.replaceChildren();
 for(const profile of profileSuggestions){
  const section=node("section");section.className="panel";
  const h=node("h3",profile.label);section.append(h);
  const inputLabel=node("label","Username for "+profile.label+" ");
  const input=node("input");input.type="text";input.maxLength=60;input.autocomplete="off";input.spellcheck=false;input.value=profile.handle;
  input.setAttribute("aria-label",profile.label+" username");
  inputLabel.append(input);section.append(inputLabel);
  const note=node("p","Suggested address only. Account not verified.");note.className="hint";section.append(note);
  const link=node("a","Open suggested "+profile.label+" profile");
  link.href=profile.address;link.target="_blank";link.rel="noopener noreferrer";
  section.append(link);
  const actions=node("div");actions.className="actions";
  const button=node("button","Connect "+profile.label);button.type="button";button.disabled=!linkingAvailable;
  button.setAttribute("aria-label","Connect "+profile.label+" using its official account permissions");
  actions.append(button);section.append(actions);
  input.addEventListener("change",()=>{
   try{
    const proposed=suggestedSocialProfiles(profileSuggestions[0].handle,{[profile.id]:input.value}).find(x=>x.id===profile.id);
    profile.handle=proposed.handle;profile.address=proposed.address;
    link.href=profile.address;input.value=profile.handle;
    note.textContent="Suggested account address updated. Not yet verified.";
   }catch(e){note.textContent=String(e.message||e);input.focus();}
  });
  button.addEventListener("click",()=>connect(profile.id,input.value,button));
  list.append(section);
 }
 if(!linkingAvailable){
   const p=node("p","Account permission requests are not enabled yet. The addresses above are suggestions; no accounts have been linked.");
   p.className="hint";list.append(p);
 }
}
function preview(event){
 event.preventDefault();
 try{
  const parsed=normaliseSocialHandle($("common-handle").value);
  profileSuggestions=suggestedSocialProfiles(parsed.handle);
  $("handle-note").textContent=parsed.spacingRemoved?"Spaces were removed to form the suggested username. Check each address carefully.":"Check each suggested address before connecting.";
  render();
 }catch(e){$("handle-note").textContent=String(e.message||e);}
}
async function checkConnections(){
 try{
  const response=await socialRequest("status");
  linkingAvailable=response.available===true;
  const out=$("connected-accounts");out.replaceChildren();
  for(const c of response.connections||[]){
   const label=(c.display_name||c.account_handle||c.account_id||"Unnamed account");
   out.append(node("li",c.provider+": "+label+" ("+(c.status||"pending")+")"));
  }
  if(!response.connections?.length)out.append(node("li","No verified social accounts connected."));
  $("connection-status").textContent=linkingAvailable?"Ready for provider approval. Choose Connect under each account.":"CBTeD is awaiting platform app configuration before approval requests can be issued.";
 }catch(e){
  linkingAvailable=false;
  $("connection-status").textContent="Account-linking service is not configured. Suggested profile links are available, but no publishing permission has been granted.";
  $("connected-accounts").replaceChildren();
 }
 if(profileSuggestions.length)render();
}
async function initialise(){
 try{
  config=await loadPublicConfig();
  db=createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  await session();
  status("Signed in. Enter a username to prepare profile suggestions.");
  await checkConnections();
 }catch(e){
  status(String(e.message||e),true);
 }
}
$("handle-form").addEventListener("submit",preview);
await initialise();
