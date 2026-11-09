import assert from "node:assert/strict";
const base="https://dmzzyfiwtosxtyekpbfi.supabase.co/functions/v1";
const review=base+"/cbted-external-review";
const mcp=base+"/cbted-mcp";
async function call(url,body,headers={}){
 const res=await fetch(url,{method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
 return {status:res.status,json:await res.json()};
}
const blocked=await call(review,{action:"list",project_id:"00000000-0000-4000-8000-000000000000"});
assert.equal(blocked.status,401,"Unauthenticated project reads must be denied");
const badToken=await call(review,{action:"reviewer_get"},{"x-review-token":"not-a-valid-invitation"});
assert.equal(badToken.status,403,"Uninvited reviewer cannot read any work");
const list=await call(mcp,{jsonrpc:"2.0",id:1,method:"tools/list"});
assert.equal(list.status,200);
const names=list.json.result.tools.map(t=>t.name);
for(const name of ["cbted_review_create","cbted_review_list","cbted_review_approve","cbted_review_reviewers","cbted_review_add_reviewer","cbted_review_invite","cbted_review_feedback","cbted_review_revoke","cbted_1f916_front"])assert.ok(names.includes(name),name+" missing");
const unauth=await call(mcp,{jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"cbted_review_list",arguments:{project_id:"00000000-0000-4000-8000-000000000000"}}});
assert.equal(unauth.status,200);
assert.equal(unauth.json.result.isError,true,"MCP must require authenticated Supabase user for private reviews");
console.log("Live review endpoint and MCP unauthorized-access checks passed.");
