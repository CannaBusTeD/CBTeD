// CBTeD independent specialist routing. ChatGPT selects the requested operation;
// this deterministic contract rejects unrelated studios and returns mandatory checks.
export const OPERATIONS=Object.freeze({
  write_song:{studio:"writing",requires:["brief"],steps:["source_check","writing_draft","writing_critique","writing_edit","writing_language_audit","writing_rewrite","writing_proofread","writing_review"]},
  edit_lyrics:{studio:"writing",requires:["source_text"],steps:["source_check","writing_critique","writing_edit","writing_language_audit","writing_proofread","writing_review"]},
  review_lyrics:{studio:"writing",requires:["source_text"],steps:["source_check","writing_critique","writing_language_audit","writing_proofread","writing_review"]},
  create_images:{studio:"visual",requires:["brief"],steps:["visual_analysis","visual_select_tool","visual_prompt","visual_generate","visual_review"]},
  create_audio:{studio:"audio",requires:["brief"],steps:["audio_direction","audio_select_tool","audio_generate","audio_review"]},
  animate_image:{studio:"animation",requires:["image_asset_id","brief"],steps:["source_check","animation_storyboard","animation_motion_plan","animation_select_tool","animation_generate","animation_review"]},
  make_music_video:{studio:"animation",requires:["image_asset_id","audio_asset_id","brief"],steps:["source_check","animation_storyboard","animation_motion_plan","animation_select_tool","animation_generate","animation_review","animation_assembly","release_audit"]}
});
const id=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function routeSpecialist(input={}){
 const operation=String(input.operation||"");
 const spec=OPERATIONS[operation];if(!spec)throw Error("Select a supported specialist operation");
 const brief=String(input.brief||"").trim(),source=String(input.source_text||"").trim();
 if(spec.requires.includes("brief")&&!brief)throw Error("A creative brief is required");
 if(spec.requires.includes("source_text")&&!source)throw Error("The supplied verse or lyrics are required");
 if(brief.length>20000||source.length>120000)throw Error("Source exceeds supported input length");
 for(const field of ["image_asset_id","audio_asset_id"]){
  if(spec.requires.includes(field)&&!id.test(String(input[field]||"")))throw Error(field+" must reference a real project-owned asset");
 }
 const count=operation==="create_images"?Number(input.count??1):1;
 if(!Number.isInteger(count)||count<1||count>20)throw Error("Image count must be one to twenty");
 const steps=[];
 function add(key,kind="text",requires_approval=false){
  steps.push({key,studio:spec.studio,kind,depends_on:steps.length?[steps[steps.length-1].key]:[],requires_approval});
 }
 for(const stage of spec.steps){
  if(["visual_prompt","visual_generate","visual_review"].includes(stage)){
   for(let i=1;i<=count;i++)add(stage+"_"+i,stage==="visual_generate"?"image":"text",stage==="visual_generate");
  }else add(stage,stage.includes("generate")?(spec.studio==="audio"?"audio":"video"):stage==="animation_assembly"?"video":"text",stage==="audio_generate"||stage==="animation_generate"||stage==="animation_assembly");
 }
 // For multi-image requests, each image is generated and reviewed before the next.
 if(operation==="create_images"&&count>1){
  const prefix=steps.filter(s=>!/^visual_(prompt|generate|review)_/.test(s.key));
  const media=[];for(let i=1;i<=count;i++)for(const stage of ["visual_prompt","visual_generate","visual_review"])media.push(steps.find(s=>s.key===stage+"_"+i));
  const ordered=[...prefix,...media];ordered.forEach((s,i)=>s.depends_on=i?[ordered[i-1].key]:[]);
  steps.splice(0,steps.length,...ordered);
 }
 return {operation,studio:spec.studio,requires:spec.requires,source_preserved:true,independent:true,
  steps,executed:false,created:false,
  note:"This is a specialist execution contract, not generated content. ChatGPT must run each actual creative tool, verify its output and record results."};
}
