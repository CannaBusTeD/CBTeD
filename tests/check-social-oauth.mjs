import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {webcrypto} from "node:crypto";
import {PROVIDERS,configuredProvider,providerAuthorisationUrl,providerTokenEndpoint,scopesFor,parseGrantedScopes,canPost} from "../supabase/functions/_shared/social-providers.mjs";
const redirect="https://example.supabase.co/functions/v1/cbted-social-connect/callback";
const env={get(k){return ({"CBTED_GOOGLE_CLIENT_ID":"google-id","CBTED_GOOGLE_CLIENT_SECRET":"secret","CBTED_TIKTOK_CLIENT_KEY":"tiktok-id","CBTED_TIKTOK_CLIENT_SECRET":"secret"})[k]||null}};
test("all providers have supported official endpoints and only configured ones are ready",()=>{
 assert.deepEqual(PROVIDERS,["youtube","facebook","instagram","tiktok","x"]);
 assert.equal(configuredProvider("youtube",env).enabled,true);
 assert.equal(configuredProvider("x",env).enabled,false);
 assert.throws(()=>configuredProvider("unknown",env),/Unsupported/);
 for(const p of PROVIDERS){assert.equal(new URL(providerTokenEndpoint(p)).protocol,"https:");assert.ok(scopesFor(p).length>0);}
});
test("OAuth uses state and fixed redirect, YouTube and X require PKCE, and Facebook/TikTok do not require local passwords",()=>{
 for(const p of PROVIDERS){
  const url=new URL(providerAuthorisationUrl({provider:p,clientId:"app-id",redirectUri:redirect,state:"high-entropy-state",challenge:"challenge-string"}));
  assert.equal(url.searchParams.get("state"),"high-entropy-state");
  assert.equal(url.searchParams.get("redirect_uri"),redirect);
  assert.equal(url.searchParams.get("response_type"),"code");
  if(p==="x"||p==="youtube")assert.equal(url.searchParams.get("code_challenge_method"),"S256");
  assert.ok(!url.toString().includes("secret"));
 }
 assert.throws(()=>providerAuthorisationUrl({provider:"x",clientId:"id",redirectUri:redirect,state:"x"}),/PKCE/);
});
test("posting permissions require actual granted scopes, not a pasted username",()=>{
 assert.equal(canPost("youtube",parseGrantedScopes("youtube","https://www.googleapis.com/auth/youtube.upload")),true);
 assert.equal(canPost("youtube",[]),false);
 assert.equal(canPost("facebook",["pages_show_list"]),false);
 assert.equal(canPost("instagram",["instagram_content_publish"]),true);
 assert.equal(canPost("tiktok",["user.info.basic"]),false);
 assert.equal(canPost("x",["tweet.write"]),true);
});
test("social tables isolate OAuth state and credentials and read requests by owner",()=>{
 const migration=readFileSync(new URL("../supabase/migrations/20261118231500_social_connections.sql",import.meta.url),"utf8");
 for(const table of ["cbted_social_oauth_states","cbted_social_connections","cbted_social_credentials","cbted_social_post_requests"]){
  assert.match(migration,new RegExp("alter table public\\."+table+" enable row level security","i"));
 }
 assert.match(migration,/revoke all on public\.cbted_social_credentials from anon, authenticated/i);
 assert.match(migration,/revoke all on public\.cbted_social_oauth_states from anon, authenticated/i);
 assert.match(migration,/auth\.uid\(\)\)=owner_id/);
});
const src=readFileSync(new URL("../supabase/functions/cbted-social-connect/index.ts",import.meta.url),"utf8");
test("OAuth callback consumes state atomically, encrypts provider tokens, no auto post",()=>{
 assert.match(src,/state_hash:"eq\."\+hash,consumed_at:"is\.null",expires_at:"gt\."\+now/);
 assert.match(src,/crypto\.subtle\.encrypt\(\{name:"AES-GCM"/);
 assert.match(src,/cbted_social_credentials/);
 assert.match(src,/Provider posting adapters have not been authorised and tested/);
 assert.ok(!src.includes("localStorage"));
});
test("actual backend refuses anonymous users, unconfigured starts and publishing",async()=>{
 let handler;let authCalls=0;
 const env={
  SUPABASE_URL:"https://example.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"service-test-only",
  SUPABASE_ANON_KEY:"anon-test-only",
 };
 const fakeFetch=async(url,init={})=>{
  if(String(url).endsWith("/auth/v1/user")){
   authCalls++;
   return new Response(JSON.stringify({id:"00000000-0000-4000-8000-000000000001"}),{status:200});
  }
  if(String(url).includes("/rest/v1/")){
   return new Response("[]",{status:200});
  }
  throw Error("Unexpected outbound request "+url);
 };
 const sandbox={Deno:{env:{get(k){return env[k]||null}},serve(fn){handler=fn}},Response,Request,URL,URLSearchParams,
   TextEncoder,crypto:webcrypto,fetch:fakeFetch,atob,btoa,console};
 const withoutImports=src.replace(/^import\s+\{[^\n]+\}\s+from\s+"[^"]+";\s*/,"");
 const values=await import("../supabase/functions/_shared/social-providers.mjs");
 Object.assign(sandbox,values);
 vm.runInNewContext(withoutImports,sandbox,{filename:"cbted-social-connect/index.ts"});
 const base="https://example.supabase.co/functions/v1/cbted-social-connect/";
 const anon=await handler(new Request(base+"status"));
 assert.equal(anon.status,401);
 assert.equal(authCalls,0);
 const post=(action,payload)=>new Request(base+action,{method:"POST",headers:{Authorization:"Bearer fake-but-verified"},body:JSON.stringify(payload)});
 const start=await handler(post("start",{provider:"youtube",handle:"CannaBusTeD"}));
 assert.equal(start.status,503);
 const d=await start.json();assert.match(d.error,/not configured/i);
 const publish=await handler(post("publish",{request_id:"irrelevant"}));
 assert.equal(publish.status,501);
 const invalid=await handler(new Request(base+"callback?state=short&code=abc"));
 assert.equal(invalid.status,303);
 assert.match(invalid.headers.get("location")||"",/social=failed/);
});
console.log("CBTeD social OAuth boundaries verified.");
