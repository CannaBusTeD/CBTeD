// CBTeD intent-based specialist router. No generation or database mutations.
export const ROUTES=Object.freeze({
 editorial:{studio:"writing",agents:["writing_critic","writing_editor","language_auditor","writing_proofreader","writing_reviewer"]},
 critique:{studio:"writing",agents:["writing_critic","language_auditor"]},
 new_song:{studio:"writing",agents:["writing_author","writing_critic","writing_editor","language_auditor","writing_synthesizer","writing_proofreader","writing_reviewer"]},
 verse:{studio:"writing",agents:["writing_author","writing_critic","language_auditor","writing_proofreader"]},
 images:{studio:"visual",agents:["visual_analyst","visual_tool_selector","visual_prompt_writer","image_generator","image_reviewer"]},
 audio:{studio:"audio",agents:["audio_director","audio_tool_selector","audio_generator","audio_reviewer"]},
 video_from_assets:{studio:"animation",agents:["storyboarding_director","motion_prompt_writer","video_tool_selector","video_generator","video_reviewer"]},
 complete:{studio:"core",agents:[]}
});
const key=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
export function routeTask({intent,source_kind,has_existing_source=false,has_image=false,has_audio=false,image_count=1,video_count=1}={}){
 const mode=key(intent);
 if(!(mode in ROUTES))throw Error("Unknown CBTeD task intent; clarify before proceeding");
 if(!Number.isInteger(image_count)||image_count<1||image_count>20)throw Error("Image count must be one to twenty");
 if(!Number.isInteger(video_count)||video_count<1||video_count>20)throw Error("Video count must be one to twenty");
 if(["editorial","critique","video_from_assets"].includes(mode)&&!has_existing_source)throw Error("Existing source is required for this task");
 if(mode==="video_from_assets"&&!has_image)throw Error("An existing image is required for image-to-video");
 const stages=[];
 const add=(agent,studio,output=1)=>stages.push({agent,studio,output});
 const sequence=(type)=>{const spec=ROUTES[type];for(const agent of spec.agents){
   if(agent==="image_generator"||agent==="image_reviewer"||agent==="visual_prompt_writer")for(let i=1;i<=image_count;i++)add(agent,spec.studio,i);
   else if(agent==="video_generator"||agent==="video_reviewer")for(let i=1;i<=video_count;i++)add(agent,spec.studio,i);
   else add(agent,spec.studio);
 }};
 if(mode==="complete"){
   sequence("new_song");sequence("images");sequence("audio");sequence("video_from_assets");
 }else sequence(mode);
 return {intent:mode,source_kind:source_kind||null,reuse_existing_source:!!has_existing_source,
   reuse_existing_image:!!has_image,reuse_existing_audio:!!has_audio,
   studios:[...new Set(stages.map(x=>x.studio))],stages};
}
