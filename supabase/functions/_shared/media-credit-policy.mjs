// Pure CBTeD generation-credit policy. Never infer "included" from a total purchased balance.
// Unknown quotes or stale/ambiguous allowance information are always approval-gated.
export const MEDIA_PROVIDERS=Object.freeze(["chatgpt","runway","higgsfield","suno","elevenlabs"]);
export const MEDIA_KINDS=Object.freeze(["image","video","audio"]);
export const QUOTE_MAX_AGE_MS=2*60*1000;
const number=(x)=>typeof x==="number"&&Number.isFinite(x)&&x>=0;
export function generationDecision({
 provider,estimatedCredits,includedRemaining,remainingSource,observedAt,
 reservedCredits=0,billingMode="credits",now=Date.now()
}={}){
 if(!MEDIA_PROVIDERS.includes(provider))throw Error("Unsupported generation provider");
 if(provider==="chatgpt"){
  // Native ChatGPT images have no third-party credit debit.
  if(billingMode!=="native")throw Error("ChatGPT images must use the native, non-credit-billed mode");
  return {status:"ready",approvalRequired:false,overageCredits:0,reason:"ChatGPT native tool uses its own plan limits; no external credit charge"};
 }
 if(billingMode==="free_generation" && estimatedCredits===0 && remainingSource==="provider_tool" &&
   Number.isFinite(Date.parse(observedAt||"")) && now-Date.parse(observedAt)>=0 &&
   now-Date.parse(observedAt)<=QUOTE_MAX_AGE_MS)
  return {status:"ready",approvalRequired:false,overageCredits:0,reason:"An applicable provider free generation has been verified"};
 if(!number(estimatedCredits))
  return {status:"awaiting_quote",approvalRequired:true,overageCredits:null,reason:"Exact provider credit cost unknown"};
 const remainingKnown=number(includedRemaining) && remainingSource==="provider_tool" &&
  Number.isFinite(Date.parse(observedAt||"")) &&
  now-Date.parse(observedAt)>=0 && now-Date.parse(observedAt)<=QUOTE_MAX_AGE_MS;
 if(!remainingKnown)return {
  status:"awaiting_approval",approvalRequired:true,overageCredits:null,
  reason:"Provider has not confirmed how many subscription-included credits remain"
 };
 const included=Math.max(0,includedRemaining-(number(reservedCredits)?reservedCredits:0));
 const overage=Math.max(0,estimatedCredits-included);
 return {status:overage===0?"ready":"awaiting_approval",approvalRequired:overage>0,overageCredits:overage,
  reason:overage===0?"Credit quote fits the observed subscription-included allowance":"Generation would use credits beyond the included allowance"};
}
export function validGenerationSpec(x){
 if(!x||!MEDIA_PROVIDERS.includes(x.provider)||!MEDIA_KINDS.includes(x.kind))throw Error("Select a supported provider and output");
 if(typeof x.prompt!=="string"||!x.prompt.trim()||x.prompt.length>20000)throw Error("A creative prompt is required");
 if(x.model!=null && (typeof x.model!=="string"||x.model.length>100))throw Error("Invalid model");
 if(x.duration!=null && (!Number.isInteger(x.duration)||x.duration<1||x.duration>(x.kind==="audio"?360:120)))throw Error("Invalid video duration");
 if(x.aspect_ratio!=null && !/^(?:auto|[1-9]\d*:[1-9]\d*)$/.test(x.aspect_ratio))throw Error("Invalid aspect ratio");
 if(x.estimated_credits!=null && (!number(x.estimated_credits)||x.estimated_credits>100000))throw Error("Invalid credit quote");
 return true;
}
