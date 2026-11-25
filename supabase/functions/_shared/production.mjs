// CBTeD orchestration contract. Pure, testable and free of provider calls.
// The model may suggest work; only this deterministic planner decides authorised steps.
export const AGENTS = Object.freeze({
  writing_author:{studio:"writing",role:"Write an initial draft faithful to the source and locked rules.",kind:"text"},
  writing_critic:{studio:"writing",role:"Deliver a line-specific, uncompromising critique of the whole draft.",kind:"text"},
  writing_editor:{studio:"writing",role:"Propose precise edits without altering the authoritative source.",kind:"text"},
  language_auditor:{studio:"writing",role:"Spot formulaic AI-style phrasing, repetitive patterns and clichés. Never claim authorship detection is conclusive.",kind:"text"},
  writing_synthesizer:{studio:"writing",role:"Rewrite using the draft, criticism, editorial suggestions and current user corrections.",kind:"text"},
  writing_proofreader:{studio:"writing",role:"Check spelling, culturally neutral diction, sung cadence, consistency and source fidelity.",kind:"text"},
  writing_reviewer:{studio:"writing",role:"Check all prior stages against the actual source and master workflow before handoff.",kind:"text"},
  audio_director:{studio:"audio",role:"Create a musically coherent arrangement and production specification.",kind:"text"},
  audio_tool_selector:{studio:"audio",role:"Select eligible, currently configured music tools; do not invent availability.",kind:"text"},
  audio_generator:{studio:"audio",role:"Produce an actual audio asset using an authorised provider only.",kind:"audio"},
  audio_reviewer:{studio:"audio",role:"Check the generated audio against the approved musical and lyrical brief.",kind:"text"},
  visual_analyst:{studio:"visual",role:"Analyse source, real references, character continuity and target scenes.",kind:"text"},
  visual_tool_selector:{studio:"visual",role:"Choose a configured, suitable image provider and disclose limitations.",kind:"text"},
  visual_prompt_writer:{studio:"visual",role:"Write a single source-grounded prompt, respecting negative constraints.",kind:"text"},
  image_generator:{studio:"visual",role:"Create one image, using approved references and the authorised tool.",kind:"image"},
  image_reviewer:{studio:"visual",role:"Inspect the actual image independently against its prompt, rules and continuity.",kind:"text"},
  storyboarding_director:{studio:"animation",role:"Plan chronology, continuity, camera, and sequence timings.",kind:"text"},
  motion_prompt_writer:{studio:"animation",role:"Plan shot motion for text-to-video from an idea, or image-to-video using verified approved stills only when supplied.",kind:"text"},
  video_tool_selector:{studio:"animation",role:"Select an actual configured video-generation provider.",kind:"text"},
  video_generator:{studio:"animation",role:"Produce exactly one verified motion asset.",kind:"video"},
  video_reviewer:{studio:"animation",role:"Inspect actual output for temporal, facial and camera continuity.",kind:"text"},
  sequence_assembler:{studio:"animation",role:"Assemble verified clips and audio into a final sequence.",kind:"video"},
  release_auditor:{studio:"core",role:"Check final source, verified outputs, rules and complete delivery.",kind:"text"},
  idea_developer:{studio:"core",role:"Develop the creator's rough idea into one clear concept: premise, audience, message, tone, format, length and target platforms. Keep the creator's own words and intent.",kind:"text"},
  idea_critic:{studio:"core",role:"Challenge the concept honestly: originality, clarity, hook, audience fit and whether the configured tools can actually make it.",kind:"text"},
  idea_refiner:{studio:"core",role:"Combine the concept, the critique and the creator's corrections into one final concept brief for the writers.",kind:"text"},
  scene_storyboarder:{studio:"visual",role:"Turn the approved writing into numbered scenes, one per planned image: what is seen, who appears, setting, mood and the line or moment it serves.",kind:"text"},
  publish_planner:{studio:"publish",role:"Write each platform's title, description, hashtags, privacy, schedule and AI-content disclosure for the final video. Never invent connected accounts.",kind:"text"},
  publisher:{studio:"publish",role:"Send only the approved final video and approved text to the approved connected accounts, through the configured publishing service only.",kind:"publish"},
  publish_verifier:{studio:"publish",role:"Check the publishing service's actual status for every platform and report each live link or error. Never assume a post succeeded.",kind:"text"}
});
const allowed = new Set(["writing","writing_critique","writing_suggestions","writing_line_edit","writing_rewrite","visual","animation","song_video","idea_to_publish","idea_to_publish_audio","song_video_publish","audio","animation_publish","plan_only"]);
// Approval-gated kinds: anything that spends money on media or acts in public.
export const GATED_KINDS=Object.freeze(["image","video","audio","publish"]);
export function buildPlan({workflow,intent="plan",image_count=1,video_count=1}={}){
  if(!allowed.has(workflow))throw Error("Unknown workflow");
  if(!["plan","execute"].includes(intent))throw Error("Intent must be plan or execute");
  if(!Number.isInteger(image_count)||image_count<1||image_count>20)throw Error("image_count must be 1..20");
  if(!Number.isInteger(video_count)||video_count<1||video_count>20)throw Error("video_count must be 1..20");
  if(workflow==="plan_only")return {intent:"plan",workflow,steps:[]};
  const steps=[];
  function add(key,agent,depends_on=[],approval_required=false){
    if(steps.some(s=>s.key===key))throw Error("Duplicate stage");
    if(!(agent in AGENTS))throw Error("Missing agent");
    for(const dep of depends_on){if(!steps.some(s=>s.key===dep))throw Error("Dependency must precede dependent stage: "+dep);}
    const cfg=AGENTS[agent];
    if(GATED_KINDS.includes(cfg.kind)&&!approval_required)throw Error("Media and publishing stages require explicit approval");
    steps.push({key,agent,studio:cfg.studio,kind:cfg.kind,depends_on,approval_required,description:cfg.role,sequence:steps.length+1});
    return key;
  }
  let writingLast=null;
  if(["writing_critique","writing_suggestions","writing_line_edit","writing_rewrite"].includes(workflow)){
    const selection={
      writing_critique:[["writing_critique","writing_critic"],["writing_language_audit","language_auditor"],["writing_review","writing_reviewer"]],
      writing_suggestions:[["writing_critique","writing_critic"],["writing_language_audit","language_auditor"],["writing_edit","writing_editor"],["writing_review","writing_reviewer"]],
      writing_line_edit:[["writing_edit","writing_editor"],["writing_language_audit","language_auditor"],["writing_review","writing_reviewer"]],
      writing_rewrite:[["writing_critique","writing_critic"],["writing_edit","writing_editor"],["writing_language_audit","language_auditor"],["writing_rewrite","writing_synthesizer"],["writing_proofread","writing_proofreader"],["writing_review","writing_reviewer"]]
    }[workflow];
    for(const [key,agent] of selection)writingLast=add(key,agent,writingLast?[writingLast]:[]);
  }
  let ideaLast=null;
  if(["idea_to_publish","idea_to_publish_audio"].includes(workflow)){
    ideaLast=add("idea_develop","idea_developer");
    ideaLast=add("idea_critique","idea_critic",[ideaLast]);
    ideaLast=add("idea_refine","idea_refiner",[ideaLast]);
  }
  if(["writing","song_video","song_video_publish","idea_to_publish","idea_to_publish_audio"].includes(workflow)){
    // In idea_to_publish the creator must explicitly approve the refined idea before any writing starts.
    writingLast=add("writing_draft","writing_author",ideaLast?[ideaLast]:[],["idea_to_publish","idea_to_publish_audio"].includes(workflow));
    writingLast=add("writing_critique","writing_critic",[writingLast]);
    writingLast=add("writing_edit","writing_editor",[writingLast]);
    writingLast=add("writing_language_audit","language_auditor",[writingLast]);
    writingLast=add("writing_rewrite","writing_synthesizer",[writingLast]);
    writingLast=add("writing_proofread","writing_proofreader",[writingLast]);
    writingLast=add("writing_review","writing_reviewer",[writingLast]);
  }
  let audioLast=null;
  if(["audio","song_video","song_video_publish","idea_to_publish_audio"].includes(workflow)){
    audioLast=add("audio_direction","audio_director",writingLast?[writingLast]:[]);
    audioLast=add("audio_select_tool","audio_tool_selector",[audioLast]);
    audioLast=add("audio_generate","audio_generator",[audioLast],true);
    audioLast=add("audio_review","audio_reviewer",[audioLast]);
  }
  let storyLast=null;
  if(["idea_to_publish","idea_to_publish_audio"].includes(workflow))storyLast=add("story_storyboard","scene_storyboarder",audioLast?[writingLast,audioLast]:[writingLast]);
  let visualLast=null;
  if(["visual","song_video","song_video_publish","idea_to_publish","idea_to_publish_audio"].includes(workflow)){
    const before=storyLast||audioLast||writingLast;
    let last=add("visual_analysis","visual_analyst",before?[before]:[]);
    last=add("visual_select_tool","visual_tool_selector",[last]);
    for(let i=1;i<=image_count;i++){
      const prompt=add("visual_prompt_"+i,"visual_prompt_writer",[last]);
      const image=add("visual_generate_"+i,"image_generator",[prompt],true);
      last=add("visual_review_"+i,"image_reviewer",[image]);
    }
    visualLast=last;
  }
  let releaseLast=null;
  if(["animation","animation_publish","song_video","song_video_publish","idea_to_publish","idea_to_publish_audio"].includes(workflow)){
    let last=add("animation_storyboard","storyboarding_director",[...new Set([visualLast,audioLast].filter(Boolean))]);
    last=add("animation_motion_plan","motion_prompt_writer",[last]);
    last=add("animation_select_tool","video_tool_selector",[last]);
    for(let i=1;i<=video_count;i++){
      const video=add("animation_generate_"+i,"video_generator",[last],true);
      last=add("animation_review_"+i,"video_reviewer",[video]);
    }
    const assembled=add("animation_assembly","sequence_assembler",[last],true);
    releaseLast=add("release_audit","release_auditor",[assembled]);
  }
  if(["idea_to_publish","idea_to_publish_audio","song_video_publish","animation_publish"].includes(workflow)){
    // Publishing is a public, side-effecting action: it always needs its own explicit approval.
    let last=add("publish_plan","publish_planner",[releaseLast]);
    last=add("publish_send","publisher",[last],true);
    add("publish_verify","publish_verifier",[last]);
  }
  return {intent,workflow,steps};
}
export function parseImageSize(size){
  const match=/^(\d{3,4})x(\d{3,4})$/.exec(String(size??""));
  const width=Number(match?.[1]),height=Number(match?.[2]);
  if(!match||width%16||height%16||width>3840||height>2160||width/height>3||height/width>3)
    throw Error("Image size must be valid supported WIDTHxHEIGHT");
  return {width,height};
}
// A review passes only when its text starts with an explicit PASS verdict. Anything else fails closed.
export function reviewPassed(text){
  return /^VERDICT:\s*PASS\b/i.test(String(text??"").trimStart());
}
export function authorisation({plan,step_key,states={},approvals={},rules_changed=false}){
  if(plan.intent!=="execute")return {allowed:false,reason:"Planning or explanation does not authorise execution"};
  if(rules_changed)return {allowed:false,reason:"Locked rules changed after the production was prepared"};
  const step=plan.steps.find(s=>s.key===step_key);
  if(!step)return {allowed:false,reason:"Unknown step"};
  if((states[step.key]||"pending")!=="pending")return {allowed:false,reason:"Step is not pending"};
  for(const dep of step.depends_on){
    if(states[dep]!=="passed")return {allowed:false,reason:"Dependency incomplete: "+dep};
  }
  if(step.approval_required&&approvals[step.key]!=="approved")return {allowed:false,reason:"Explicit step approval is missing or revoked"};
  return {allowed:true,reason:"Eligible for an atomic claim"};
}
export function modelInstruction(step,masterRules,projectRules,original,priorResults,instructions){
  if(!step||!AGENTS[step.agent])throw Error("Unknown agent");
  const payload=[
    "You are the "+step.agent+" specialist in a controlled CBTeD studio.",
    "Do ONLY the task for this agent. Do not call other tools or advance the workflow.",
    "Preserve creator-authored work and approvals. Never claim to have verified anything you have not inspected.",
    "Authoritative universal rules (apply in full):",masterRules,
    "Project-specific locked rules:",projectRules,
    "Current creative request:",instructions,
    "Actual original source:",original,
    "Earlier verified stage outputs:",priorResults,
    "This stage and no other:",step.key+" :: "+step.description
  ].join("\n\n");
  if(payload.length>180000)throw Error("Authoritative context exceeds the configured limit; split or archive project inputs without silently truncating rules");
  return payload;
}
