// CBTeD social connections: the creator consents on each provider's OWN authorisation page.
// No handle, guessed profile link, AI suggestion or draft ever grants posting access.
import {PROVIDERS,META_VERSION,configuredProvider,providerAuthorisationUrl,providerTokenEndpoint,parseGrantedScopes,canPost,isValidProvider} from "../_shared/social-providers.mjs";
const ROOT=String(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");
const SERVICE=String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"");
const ANON=(()=>{const direct=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY");if(direct)return String(direct);try{return JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default||""}catch{return ""}})();
const CALLBACK=ROOT+"/functions/v1/cbted-social-connect/callback";
const RETURN="https://cannabusted.github.io/CBTeD/socials.html";
const HEADERS={"content-type":"application/json","cache-control":"no-store","access-control-allow-origin":"*","access-control-allow-headers":"apikey,authorization,content-type","access-control-allow-methods":"GET,POST,OPTIONS"};
const ALLOWED_TABLES=new Set(["cbted_social_oauth_states","cbted_social_connections","cbted_social_credentials","cbted_social_post_requests","projects","assets"]);
const UUID=/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const response=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:HEADERS});
const bytesToB64=(bytes)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const random=()=>bytesToB64(crypto.getRandomValues(new Uint8Array(32)));
const sha256=async(s)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))).map(v=>v.toString(16).padStart(2,"0")).join("");
const codeChallenge=async(s)=>bytesToB64(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))));
function requireSecret(){
 if(!ROOT||!SERVICE||!ANON)throw Error("CBTeD social backend is not configured");
}
async function rest(table,method="GET",query={},body,options={}){
 requireSecret();
 if(!ALLOWED_TABLES.has(table))throw Error("Disallowed database table");
 const qs=new URLSearchParams(query).toString();
 const url=ROOT+"/rest/v1/"+table+(qs?"?"+qs:"");
 const headers={apikey:SERVICE,authorization:"Bearer "+SERVICE,"content-type":"application/json",Prefer:options.prefer||"return=representation"};
 const resp=await fetch(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 const payload=await resp.text();let parsed=null;
 try{parsed=payload?JSON.parse(payload):null;}catch{throw Error("Database response invalid");}
 if(!resp.ok)throw Error("Social database unavailable ("+resp.status+")");
 return parsed;
}
async function authUser(request){
 requireSecret();
 const match=/^Bearer ([^\s]+)$/.exec(request.headers.get("authorization")||"");
 if(!match)throw Error("CBTeD sign-in required");
 const resp=await fetch(ROOT+"/auth/v1/user",{headers:{apikey:ANON,authorization:"Bearer "+match[1]}});
 if(!resp.ok)throw Error("CBTeD sign-in expired");
 const data=await resp.json();
 if(!UUID.test(data.id||""))throw Error("CBTeD account not verified");
 return data.id;
}
function configured(){
 return Object.fromEntries(PROVIDERS.map(provider=>[provider,configuredProvider(provider,Deno.env).enabled&&!!Deno.env.get("CBTED_SOCIAL_ENCRYPTION_KEY")]));
}
function validateHint(input){
 const value=String(input||"").replace(/^@/,"").trim();
 if(value&&!/^[\p{L}\p{N}._-]{1,60}$/u.test(value))throw Error("Enter a valid account username");
 return value;
}
function validateUUID(v,label){if(!UUID.test(String(v||"")))throw Error("Invalid "+label);return v}
async function encryptionKey(){
 const base64=String(Deno.env.get("CBTED_SOCIAL_ENCRYPTION_KEY")||"");
 const raw=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
 if(raw.length!==32)throw Error("Secure token storage is not configured");
 return crypto.subtle.importKey("raw",raw,{name:"AES-GCM"},false,["encrypt","decrypt"]);
}
async function seal(value){
 const key=await encryptionKey(),iv=crypto.getRandomValues(new Uint8Array(12));
 const data=new TextEncoder().encode(JSON.stringify(value));
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,data));
 return {token_ciphertext:bytesToB64(encrypted),token_nonce:bytesToB64(iv)};
}
async function exchangeToken(provider,code,verifier){
 const p=configuredProvider(provider,Deno.env);
 const common={code,grant_type:"authorization_code",redirect_uri:CALLBACK};
 let url=providerTokenEndpoint(provider),body,headers={"content-type":"application/x-www-form-urlencoded"};
 if(provider==="youtube"){
  body=new URLSearchParams({...common,client_id:p.clientId,client_secret:p.clientSecret,code_verifier:verifier});
 }else if(provider==="facebook"||provider==="instagram"){
  const q=new URLSearchParams({...common,client_id:p.clientId,client_secret:p.clientSecret});
  url+="?"+q;body=undefined;
 }else if(provider==="tiktok"){
  body=new URLSearchParams({...common,client_key:p.clientId,client_secret:p.clientSecret});
 }else{
  body=new URLSearchParams({...common,client_id:p.clientId,code_verifier:verifier});
  headers.authorization="Basic "+btoa(p.clientId+":"+p.clientSecret);
 }
 const res=await fetch(url,{method:provider==="facebook"||provider==="instagram"?"GET":"POST",headers,body});
 let data;try{data=await res.json()}catch{throw Error("Platform returned an invalid authorisation response");}
 if(!res.ok||data.error||!data.access_token)throw Error("Platform did not grant access");
 return data;
}
async function platformJSON(url,token){
 const resp=await fetch(url,{headers:{authorization:"Bearer "+token}});
 let data;try{data=await resp.json()}catch{throw Error("Platform identity response unavailable");}
 if(!resp.ok||data.error?.code&&data.error.code!=="ok")throw Error("Platform refused account verification");
 return data;
}
async function accountsFor(provider,tokens){
 const a=tokens.access_token;
 const scopes=parseGrantedScopes(provider,tokens.scope||"");
 if(provider==="youtube"){
  const doc=await platformJSON("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",a);
  const list=(doc.items||[]).filter(c=>c.id&&c.snippet);
  if(!list.length)throw Error("No YouTube channel was returned by the signed-in Google account");
  return list.map(c=>({remote_id:String(c.id),handle:String(c.snippet.customUrl||"").replace(/^@/,"")||null,
   display_name:String(c.snippet.title||"YouTube channel"),profile_url:"https://www.youtube.com/channel/"+encodeURIComponent(c.id),
   provider_token:a,scopes}));
 }
 if(provider==="facebook"||provider==="instagram"){
  const perm=await platformJSON("https://graph.facebook.com/"+META_VERSION+"/me/permissions",a);
  const granted=(perm.data||[]).filter(x=>x.status==="granted").map(x=>x.permission);
  const data=await platformJSON("https://graph.facebook.com/"+META_VERSION+"/me/accounts?fields=id,name,username,access_token,instagram_business_account%7Bid,username%7D&limit=100",a);
  const found=[];
  for(const page of data.data||[]){
   if(!page.id||!page.access_token)continue;
   if(provider==="facebook"){
    found.push({remote_id:String(page.id),handle:page.username||null,display_name:page.name||"Facebook Page",
     profile_url:"https://www.facebook.com/"+encodeURIComponent(page.username||page.id),provider_token:page.access_token,scopes:granted});
   }else if(page.instagram_business_account?.id){
    const ig=page.instagram_business_account;
    found.push({remote_id:String(ig.id),handle:ig.username||null,display_name:ig.username||page.name||"Instagram professional account",
     profile_url:ig.username?"https://www.instagram.com/"+encodeURIComponent(ig.username)+"/":null,provider_token:page.access_token,scopes:granted});
   }
  }
  if(!found.length)throw Error(provider==="facebook"?"No manageable Facebook Pages were returned":"No eligible Instagram professional account was returned");
  return found;
 }
 if(provider==="tiktok"){
  const doc=await platformJSON("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name",a);
  const u=doc.data?.user||{};
  if(!u.open_id)throw Error("TikTok did not return the authorised account");
  return [{remote_id:String(u.open_id),handle:null,display_name:String(u.display_name||"TikTok account"),
   profile_url:null,provider_token:a,scopes}];
 }
 if(provider==="x"){
  const doc=await platformJSON("https://api.x.com/2/users/me?user.fields=username,name",a);
  const u=doc.data||{};
  if(!u.id||!u.username)throw Error("X did not return the authorised account");
  return [{remote_id:String(u.id),handle:String(u.username),display_name:String(u.name||u.username),
   profile_url:"https://x.com/"+encodeURIComponent(u.username),provider_token:a,scopes}];
 }
 throw Error("Unsupported platform");
}
async function storeAccount(owner,provider,account,tokens,requested){
 const expires=Number(tokens.expires_in)>0?new Date(Date.now()+Number(tokens.expires_in)*1000).toISOString():null;
 const rows=await rest("cbted_social_connections","POST",{on_conflict:"owner_id,provider,remote_account_id"},{
  owner_id:owner,provider,remote_account_id:account.remote_id,account_handle:account.handle,
  display_name:account.display_name,profile_url:account.profile_url,requested_handle:requested||null,
  status:"needs_confirmation",post_permission:canPost(provider,account.scopes),
  scopes:account.scopes,token_expires_at:expires,updated_at:new Date().toISOString()
 },{prefer:"resolution=merge-duplicates,return=representation"});
 if(!rows?.[0]?.id)throw Error("Unable to store the authorised social account");
 const encrypted=await seal({access_token:account.provider_token,refresh_token:tokens.refresh_token||null,
  expires_at:expires,token_type:tokens.token_type||"Bearer"});
 await rest("cbted_social_credentials","POST",{on_conflict:"connection_id"},{
  connection_id:rows[0].id,...encrypted,updated_at:new Date().toISOString()
 },{prefer:"resolution=merge-duplicates,return=representation"});
}
function landing(result){
 return Response.redirect(RETURN+"?social="+encodeURIComponent(result),303);
}
async function callback(url){
 const rawState=url.searchParams.get("state")||"",code=url.searchParams.get("code")||"";
 if(!/^[A-Za-z0-9_-]{30,100}$/.test(rawState))return landing("failed");
 const hash=await sha256(rawState),now=new Date().toISOString();
 const rows=await rest("cbted_social_oauth_states","PATCH",{
  state_hash:"eq."+hash,consumed_at:"is.null",expires_at:"gt."+now,
  select:"owner_id,provider,code_verifier,expected_handle"
 },{consumed_at:now});
 const attempt=rows?.[0];
 if(!attempt)return landing("expired");
 if(url.searchParams.has("error")||!code)return landing("cancelled");
 if(!isValidProvider(attempt.provider))return landing("failed");
 try{
  const tokens=await exchangeToken(attempt.provider,code,attempt.code_verifier||"");
  const accounts=await accountsFor(attempt.provider,tokens);
  for(const account of accounts)await storeAccount(attempt.owner_id,attempt.provider,account,tokens,attempt.expected_handle);
  return landing("review");
 }catch{
  return landing("failed");
 }
}
async function signedStatus(user){
 const [connections,requests]=await Promise.all([
  rest("cbted_social_connections","GET",{owner_id:"eq."+user,select:"id,provider,remote_account_id,account_handle,display_name,profile_url,status,scopes,post_permission,token_expires_at,created_at,updated_at",order:"created_at.desc",limit:"100"}),
  rest("cbted_social_post_requests","GET",{owner_id:"eq."+user,select:"id,connection_id,project_id,asset_id,title,caption,status,privacy,scheduled_at,approved_at,created_at",order:"created_at.desc",limit:"50"})
 ]);
 const providers=configured();
 const current=Date.now();
 const safeConnections=(connections||[]).map(c=>{
  const expired=c.token_expires_at&&Number.isFinite(Date.parse(c.token_expires_at))&&Date.parse(c.token_expires_at)<=current;
  return expired&&c.status==="active"?{...c,status:"expired",post_permission:false}:c;
 });
 return {available:Object.values(providers).some(Boolean),providers,connections:safeConnections,post_requests:requests||[]};
}
async function start(user,body){
 const provider=String(body.provider||"");
 const settings=configuredProvider(provider,Deno.env);
 if(!settings.enabled||!configured()[provider])throw Error(provider+" account authorisation has not been configured yet");
 const hint=validateHint(body.handle);
 await encryptionKey(); // Reject bad or absent encryption configuration before issuing a consent link.\n const state=random(),verifier=provider==="youtube"||provider==="x"?random()+random():null;
 const challenge=verifier?await codeChallenge(verifier):null;
 await rest("cbted_social_oauth_states","POST",{},{
  state_hash:await sha256(state),owner_id:user,provider,expected_handle:hint||null,
  code_verifier:verifier,expires_at:new Date(Date.now()+10*60*1000).toISOString()
 });
 return {authorize_url:providerAuthorisationUrl({provider,clientId:settings.clientId,redirectUri:CALLBACK,state,challenge}),expires_in_seconds:600};
}
async function ownedConnection(user,id){
 validateUUID(id,"connection");
 const rows=await rest("cbted_social_connections","GET",{owner_id:"eq."+user,id:"eq."+id,limit:"1"});
 if(!rows?.[0])throw Error("Account connection not found");
 return rows[0];
}
async function confirm(user,id){
 const c=await ownedConnection(user,id);
 if(c.status!=="needs_confirmation")throw Error("Account is not awaiting confirmation");
 const status=c.post_permission?"active":"needs_permission";
 await rest("cbted_social_connections","PATCH",{id:"eq."+id,owner_id:"eq."+user},{status,updated_at:new Date().toISOString()});
 return {status,provider:c.provider,display_name:c.display_name};
}
async function disconnect(user,id){
 await ownedConnection(user,id);
 await rest("cbted_social_credentials","DELETE",{connection_id:"eq."+id});
 await rest("cbted_social_connections","PATCH",{id:"eq."+id,owner_id:"eq."+user},{status:"disconnected",post_permission:false,updated_at:new Date().toISOString()});
 return {disconnected:true,note:"Local access removed. You may also revoke CBTeD inside the platform's connected-app settings."};
}
async function createPostDraft(user,body){
 const connection=await ownedConnection(user,body.connection_id);
 if(connection.status!=="active"||!connection.post_permission)throw Error("This account has not granted publishing permission");
 if(connection.token_expires_at&&Date.parse(connection.token_expires_at)<=Date.now())
  throw Error("The social platform permission has expired. Reconnect the account before preparing a post.");
 const project=validateUUID(body.project_id,"project"),asset=validateUUID(body.asset_id,"asset");
 const owned=await rest("projects","GET",{id:"eq."+project,owner_id:"eq."+user,select:"id",limit:"1"});
 if(!owned?.length)throw Error("Project not accessible");
 const assets=await rest("assets","GET",{id:"eq."+asset,project_id:"eq."+project,select:"id,mime_type",limit:"1"});
 if(!assets?.length||!String(assets[0].mime_type||"").startsWith("video/"))throw Error("A stored project video asset is required");
 const title=String(body.title||"").trim(),caption=String(body.caption||"").trim();
 if(title.length>200||caption.length>2200)throw Error("Post text is too long");
 const privacy=String(body.privacy||"private");
 if(!["private","unlisted","public"].includes(privacy))throw Error("Invalid visibility");
 const scheduled_at=body.scheduled_at?new Date(body.scheduled_at):null;
 if(scheduled_at&&(!Number.isFinite(+scheduled_at)||+scheduled_at<Date.now()))throw Error("Scheduled time must be in the future");
 const rows=await rest("cbted_social_post_requests","POST",{},{
  owner_id:user,connection_id:connection.id,project_id:project,asset_id:asset,title,caption,privacy,
  scheduled_at:scheduled_at?.toISOString()||null,status:"awaiting_approval"
 });
 return {request_id:rows?.[0]?.id||null,status:"awaiting_approval",published:false};
}
async function approvePost(user,id,decision){
 validateUUID(id,"post request");
 const rows=await rest("cbted_social_post_requests","GET",{id:"eq."+id,owner_id:"eq."+user,limit:"1"});
 const request=rows?.[0];if(!request||request.status!=="awaiting_approval")throw Error("Post is not awaiting approval");
 if(decision!=="approved"&&decision!=="rejected")throw Error("Choose approve or reject");
 const status=decision==="approved"?"approved":"cancelled";
 await rest("cbted_social_post_requests","PATCH",{id:"eq."+id,owner_id:"eq."+user,status:"eq.awaiting_approval"},
  {status,approved_by:decision==="approved"?user:null,approved_at:decision==="approved"?new Date().toISOString():null,updated_at:new Date().toISOString()});
 return {request_id:id,status,published:false,note:"Approval recorded. Publishing remains disabled until an actual provider adapter has been verified."};
}
Deno.serve(async(request)=>{
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:HEADERS});
 const url=new URL(request.url),action=url.pathname.split("/").pop();
 if(action==="callback"&&request.method==="GET"){
  try{return await callback(url)}catch{return landing("failed")}
 }
 try{
  if(!ROOT)return response({error:"Social connector not configured"},503);
  const user=await authUser(request);
  if(action==="status"&&request.method==="GET")return response(await signedStatus(user));
  if(request.method!=="POST")return response({error:"Unsupported method"},405);
  if(Number(request.headers.get("content-length")||0)>16000)return response({error:"Request too large"},413);
  const body=await request.json();
  if(!body||typeof body!=="object"||Array.isArray(body))throw Error("Invalid request");
  if(action==="start")return response(await start(user,body));
  if(action==="confirm")return response(await confirm(user,body.connection_id));
  if(action==="disconnect")return response(await disconnect(user,body.connection_id));
  if(action==="draft-post")return response(await createPostDraft(user,body));
  if(action==="approve-post")return response(await approvePost(user,body.request_id,body.decision));
  if(action==="publish")return response({error:"Provider posting adapters have not been authorised and tested; no post sent."},501);
  return response({error:"Unknown action"},404);
 }catch(e){const message=String(e?.message||"Request rejected").slice(0,200);
  const code=/not configured|not been configured|missing/i.test(message)?503:/expired|sign-in/i.test(message)?401:400;
  return response({error:message},code);
 }
});
