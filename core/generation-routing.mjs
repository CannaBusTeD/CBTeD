// Provider dispatch is performed INSIDE ChatGPT by the creator's connected tools.
// This module returns the exact action to invoke, never pretends to invoke it.
export const GENERATOR_ACTIONS=Object.freeze({
 chatgpt:Object.freeze({image:"image_gen.text2im"}),
 runway:Object.freeze({image:"mcp__Runway__generate_image",video:"mcp__Runway__generate_video",audio:"mcp__Runway__generate_music"}),
 higgsfield:Object.freeze({image:"mcp__Higgsfield__generate_image",video:"mcp__Higgsfield__generate_video",audio:"mcp__Higgsfield__generate_audio"}),
 suno:Object.freeze({audio:"mcp__Suno__audio_create"}),
 elevenlabs:Object.freeze({audio:"mcp__ElevenLabs__creative_generate_speech"})
});
export function routeGeneration({provider,kind,audio_type="music",has_source_image=false}={}){
 if(!["image","video","audio"].includes(kind))throw Error("Choose image, video or audio");
 if(!Object.prototype.hasOwnProperty.call(GENERATOR_ACTIONS,provider))throw Error("Choose a connected generation provider");
 if(!["music","narration"].includes(audio_type))throw Error("Choose music or narration");
 const base=GENERATOR_ACTIONS[provider][kind];
 if(!base)throw Error("The selected provider cannot produce that type of media");
 if(provider==="suno"&&audio_type!=="music")throw Error("Use ElevenLabs or a compatible speech model for narration");
 if(provider==="elevenlabs"&&audio_type!=="narration")throw Error("Use Suno or a compatible music provider for songs");
 const action=provider==="runway"&&kind==="audio"&&audio_type==="narration"?
  "mcp__Runway__generate_speech":base;
 const providerActions=provider==="higgsfield"?
  {check_connection:"mcp__Higgsfield__get_profile",check_allowance:"mcp__Higgsfield__balance",
   quote:kind==="image"?"mcp__Higgsfield__estimate_image_cost":kind==="video"?"mcp__Higgsfield__estimate_video_cost":"mcp__Higgsfield__estimate_audio_cost",
   poll:"mcp__Higgsfield__jobs_wait"}:
  provider==="runway"?
  {check_connection:"mcp__Runway__whoami",check_allowance:"mcp__Runway__whoami",
   quote:"No universal direct quote endpoint. An exact provider quote is required before generating.",
   poll:"mcp__Runway__get_task"}:
  provider==="suno"?
  {check_connection:"mcp__Suno__account_me",check_allowance:"mcp__Suno__account_usage",
   quote:"Confirm the exact model/action credit cost from Suno before submitting. Unknown costs need approval.",
   poll:"mcp__Suno__audio_wait"}:
  provider==="elevenlabs"?
  {check_connection:"Connected ElevenLabs workspace",check_allowance:"Connected ElevenLabs account",
   quote:"Exact character/credit quote must be verified or approved before submission.",
   poll:"mcp__ElevenLabs__creative_get_flow_run_status"}:
  {check_connection:"ChatGPT tool available in current chat",check_allowance:"native ChatGPT usage limits",
   quote:"No third-party credit charge",poll:"image_gen result"};
 return {provider,kind,tool_action:action,check:providerActions,
  input_mode:has_source_image?"image_reference":"text_prompt",
  credit_gate:provider==="chatgpt"?"native":"cbted_media_prepare → verify provider quote → cbted_media_quote → creator approval if necessary → cbted_media_claim",
  asset_gate:"Use project-owned real media from cbted_media_reference; import verified completed outputs with cbted_media_import; inspect before marking complete.",
  executed:false,project_saved:false};
}
