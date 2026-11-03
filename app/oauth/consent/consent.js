// OAuth 2.1 consent UI for ChatGPT, not a creative production workspace.
// Browser holds its existing Supabase login. No private secrets go into GitHub.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
import { loadPublicConfig } from "../../config.js";

const $=id=>document.getElementById(id);
const authId=new URL(location.href).searchParams.get("authorization_id");
const status=(message,error=false)=>{$("status").textContent=message;$("status").classList.toggle("error",error);};
const show=id=>{$("signin").hidden=id!=="signin";$("consent").hidden=id!=="consent";};
const setBusy=busy=>["approve","deny","signin-button","switch-account"].forEach(id=>{$(id).disabled=busy;});
const safeChatGPTUrl=(text)=>{
  const url=new URL(text);
  if(url.protocol!=="https:"||url.hostname!=="chatgpt.com"||!url.pathname.startsWith("/connector"))throw Error("The authorization destination is not a recognised ChatGPT callback");
  return url.toString();
};
let db;
async function openConsent(){
  const {data:{user},error:userError}=await db.auth.getUser();
  if(userError||!user){show("signin");status("Sign in with your CBTeD project account.");return;}
  status("Reading authorization request…");
  const {data,error}=await db.auth.oauth.getAuthorizationDetails(authId);
  if(error||!data)throw Error(error?.message||"Authorization request not found or expired");
  if(data.redirect_url&&!data.authorization_id){
    location.assign(safeChatGPTUrl(data.redirect_url));
    return;
  }
  if(!data.client?.name||!data.redirect_uri)throw Error("Authorization request has incomplete client details");
  safeChatGPTUrl(data.redirect_uri);
  $("signed-in-as").textContent=user.email||"CBTeD user";
  $("client-name").textContent=data.client.name;
  $("redirect-uri").textContent=data.redirect_uri;
  const scopes=String(data.scope||"").split(" ").filter(Boolean);
  $("scopes").replaceChildren(...(scopes.length?scopes:["Access as your signed-in CBTeD user"]).map(s=>{
    const li=document.createElement("li");li.textContent=s;return li;
  }));
  show("consent");status("Review the connection and choose Approve or Deny.");
}
async function decide(approve){
  setBusy(true);
  try{
    const {data,error}=approve?await db.auth.oauth.approveAuthorization(authId):await db.auth.oauth.denyAuthorization(authId);
    if(error)throw error;
    if(!data?.redirect_url)throw Error("No callback returned by the authentication provider");
    location.assign(safeChatGPTUrl(data.redirect_url));
  }catch(error){status("Authorization failed: "+(error?.message||"Unknown error"),true);setBusy(false);}
}
async function init(){
  if(!authId||authId.length>250)throw Error("Missing or invalid authorization request identifier");
  const config=await loadPublicConfig();
  db=createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  $("signin-form").addEventListener("submit",async e=>{
    e.preventDefault();setBusy(true);
    try{
      const {error}=await db.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});
      if(error)throw error;
      $("password").value="";
      await openConsent();
    }catch(error){status("Unable to sign in: "+(error?.message||"Unknown error"),true);}
    finally{setBusy(false);}
  });
  $("approve").addEventListener("click",()=>decide(true));
  $("deny").addEventListener("click",()=>decide(false));
  $("switch-account").addEventListener("click",async()=>{
    setBusy(true);
    try{await db.auth.signOut();show("signin");status("Sign in with a different CBTeD account.");}
    finally{setBusy(false);}
  });
  await openConsent();
}
init().catch(e=>status("Cannot continue: "+(e?.message||"Unknown error"),true));