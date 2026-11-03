import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../supabase/functions/cbted-mcp/index.ts", import.meta.url), "utf8");
assert.match(source, /CBTeD ChatGPT MCP bridge/);
const projectRef = "dmzzyfiwtosxtyekpbfi";
const base = "https://" + projectRef + ".supabase.co/functions/v1/cbted-mcp";
const testUser = "00000000-0000-4000-8000-000000000001";
let handler;
let networkCalls=0;
let authenticated=false;
const fakeFetch=async(url,options={})=>{
  networkCalls+=1;
  const uri=String(url);
  if(uri.endsWith("/auth/v1/user")){
    return authenticated
      ? new Response(JSON.stringify({id:testUser,email:"tester@example.test"}),{status:200})
      : new Response(JSON.stringify({error:"unauthorized"}),{status:401});
  }
  if(uri.includes("/rest/v1/projects?")){
    return new Response(JSON.stringify([{id:"00000000-0000-4000-8000-000000000002",owner_id:testUser,title:"Test Project",status:"active"}]),{status:200});
  }
  throw Error("Unexpected network call to "+uri);
};
const sandbox={
  Deno:{env:{get(key){
    if(key==="SUPABASE_URL")return "https://"+projectRef+".supabase.co";
    if(key==="SUPABASE_PUBLISHABLE_KEYS")return JSON.stringify({default:"sb_publishable_test_only"});
    return null;
  }},serve(fn){handler=fn;}},
  Request,Response,URL,URLSearchParams,fetch:fakeFetch,console
};
vm.runInNewContext(source,sandbox,{filename:"cbted-mcp/index.ts"});
assert.equal(typeof handler,"function","Deno must register an HTTP handler");
const rpc=async(method,params={},auth=false)=>{
  const req=new Request(base,{method:"POST",headers:{"Content-Type":"application/json",...(auth?{Authorization:"Bearer mocked-test-token"}:{})},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});
  const result=await handler(req);
  assert.equal(result.status,200,"MCP RPC should return JSON");
  return result.json();
};
const health=await (await handler(new Request(base))).json();
assert.equal(health.status,"online");
assert.equal(health.rule_documents,6);
const meta=await(await handler(new Request(base+"/.well-known/oauth-protected-resource"))).json();
assert.equal(meta.resource,base);
assert.equal(meta.authorization_servers[0],"https://"+projectRef+".supabase.co/auth/v1");
const init=await rpc("initialize",{protocolVersion:"2025-06-18"});
assert.equal(init.result.serverInfo.name,"CBTeD");
const list=await rpc("tools/list");
assert.ok(list.result.tools.length>=12,"Expected full CBTeD studio/project tools");
const names=list.result.tools.map(t=>t.name);
for(const expected of ["cbted_get_rulebook","cbted_list_projects","cbted_get_project_context","cbted_create_task","cbted_record_output","cbted_get_asset_link"]){
  assert.ok(names.includes(expected),expected+" missing");
}
assert.ok(list.result.tools.find(t=>t.name==="cbted_get_rulebook").securitySchemes.some(s=>s.type==="noauth"));
assert.ok(list.result.tools.find(t=>t.name==="cbted_list_projects").securitySchemes.some(s=>s.type==="oauth2"));
const rules=await rpc("tools/call",{name:"cbted_get_rulebook",arguments:{studio:"visual"}});
assert.equal(rules.result.isError,false);
const payload=JSON.parse(rules.result.content[0].text);
assert.equal(payload.documents.length,3);
assert.match(payload.documents[0].content,/HARD RULE 1/);
assert.match(payload.documents[2].content,/Visual/);
assert.equal(networkCalls,0,"Reading public bundled rules must not access private APIs");
const blocked=await rpc("tools/call",{name:"cbted_list_projects",arguments:{}});
assert.equal(blocked.result.isError,true);
assert.ok(blocked.result._meta["mcp/www_authenticate"],"No token must trigger OAuth");
assert.equal(networkCalls,0,"Missing token must never read the database");
authenticated=true;
const projects=await rpc("tools/call",{name:"cbted_list_projects",arguments:{}},true);
assert.equal(projects.result.isError,false);
assert.equal(JSON.parse(projects.result.content[0].text).projects[0].title,"Test Project");
assert.ok(networkCalls>=2,"Authenticated call verifies the user then reads with a delegated bearer");
const notification=await handler(new Request(base,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",method:"notifications/initialized"})}));
assert.equal(notification.status,202);
console.log("CBTeD MCP protocol/auth/rules smoke tests passed ("+list.result.tools.length+" tools).");
