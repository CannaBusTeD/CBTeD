import assert from "node:assert/strict";
const url="https://dmzzyfiwtosxtyekpbfi.supabase.co/functions/v1/cbted-orchestrator";
const controller=await fetch(url+"/health",{signal:AbortSignal.timeout(15000)});
assert.equal(controller.status,200,"Live orchestrator must respond to GET /health");
const health=await controller.json();
assert.equal(health.name,"CBTeD Orchestrator");
assert.equal(health.status,"online");
assert.equal(health.provider_execution_enabled,false,"Production must remain disabled by default");
const blocked=await fetch(url+"/plan",{
 method:"POST",headers:{"content-type":"application/json"},
 body:JSON.stringify({workflow:"visual",intent:"execute",instructions:"Unsafe unauthenticated attempt"}),
 signal:AbortSignal.timeout(15000)
});
assert.notEqual(blocked.status,200,"Unauthenticated production registration MUST be refused");
const response=await blocked.json();
assert.match(JSON.stringify(response),/authentication|authori|token|apikey/i);
console.log("Live health and unauthenticated refusal passed. No creative work was initiated.");
