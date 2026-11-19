// Tool dispatch contract for CBTeD inside ChatGPT.
// These are real connector action names available to an authenticated user,
// not HTTP endpoints callable by the Supabase server.
export const GENERATOR_ACTIONS=Object.freeze({
 chatgpt:Object.freeze({image:"image_gen.text2im"}),
 runway:Object.freeze({image:"mcp__Runway__generate_image",video:"mcp__Runway__generate_video"}),
 higgsfield:Object.freeze({image:"mcp__Higgsfield__generate_image",video:"mcp__Higgsfield__generate_video"})
});
export function routeGeneration({provider,kind,has_source_image=false}={}){
 if(!["image","video"].includes(kind))throw Error("Choose image or video");
 if(!["chatgpt","runway","higgsfield"].includes(provider))throw Error("Choose a connected image or video provider");
 const action=GENERATOR_ACTIONS[provider][kind];
 if(!action)throw Error("Native ChatGPT currently generates images only; choose Runway or Higgsfield for video");
 const providerActions=provider==="higgsfield"?
  {check_connection:"mcp__Higgsfield__get_profile",check_allowance:"mcp__Higgsfield__balance",
   quote:kind==="image"?"mcp__Higgsfield__estimate_image_cost":"mcp__Higgsfield__estimate_video_cost",
   poll:"mcp__Higgsfield__jobs_wait"}:
  provider==="runway"?
  {check_connection:"mcp__Runway__whoami",check_allowance:"mcp__Runway__whoami",
   quote:"No universal direct quote endpoint. Use a real provider estimate if available; otherwise require a quote/approval and do not generate.",
   poll:"mcp__Runway__get_task"}:
  {check_connection:"ChatGPT tool available in current chat",check_allowance:"native ChatGPT usage limits",
   quote:"No third-party credit charge",poll:"image_gen result"};
 return {provider,kind,tool_action:action,check:providerActions,
   input_mode:has_source_image?"image_reference":"text_prompt",
   credit_gate:provider==="chatgpt"?"native":"cbted_media_prepare → cbted_media_quote → cbted_media_approve if needed → cbted_media_claim",
   asset_gate:"Use cbted_media_reference for actual approved project images and cbted_media_import for actual completed provider media",
   executed:false,project_saved:false};
}
