// Pure, portable CBTeD QA contract. No provider calls, credentials or private media.
// Imported by every backend that can prepare or complete visual/motion work.
export const QUALITY_CONTRACT_VERSION = 1;
const err = (code, detail) => { const e = new Error(detail); e.code = code; throw e; };
const nonEmpty = v => typeof v === "string" && !!v.trim();
const refs = v => Array.isArray(v) && v.every(nonEmpty) && new Set(v).size === v.length;
const bad = (arr, expected) => expected.filter(id => !arr.includes(id));

/** Validate the *actual* planned provider submission, not just the wording of a prompt.
 * The referenced assets must separately be checked for ownership and attached by
 * the calling backend/provider adapter. Text-only promises are not proof of attachment.
 */
export function assertQualityPreflight({kind,provider,prompt,quality,previousFailedSignatures=[]}={}) {
  if (!["image","video"].includes(kind)) return null;
  if (!quality || quality.version !== QUALITY_CONTRACT_VERSION)
    err("QA_CONTRACT_REQUIRED","Visual and animation work requires a versioned QA contract before generation.");
  if (!nonEmpty(quality.scene_id) || !nonEmpty(prompt))
    err("QA_SCENE_REQUIRED","Provide one identified scene and its actual prompt.");
  if (quality.output_count !== 1 || quality.scene_count !== 1 ||
      quality.presentation !== "individual")
    err("QA_ATOMIC_OUTPUT","Generate one independent scene, one output, in one operation; no grids, panels, collages or storyboards.");
  if (!nonEmpty(quality.requested_provider) || quality.requested_provider !== provider ||
      (quality.selected_provider && quality.selected_provider !== provider))
    err("QA_TOOL_LOCK","The requested provider is locked. A replacement needs explicit authorisation before preparation.");
  if (quality.user_approved_switch === false && quality.tool_switched === true)
    err("QA_TOOL_LOCK","An unapproved tool substitution is prohibited.");
  const required = quality.required_character_asset_ids;
  const attached = quality.attached_character_asset_ids;
  if (!refs(required) || !refs(attached))
    err("QA_REFERENCE_IDS","Reference assets must be identified and deduplicated, not merely described in words.");
  const missing = bad(attached,required);
  if (missing.length) err("QA_IDENTITY_LOCK","Every generation must attach each required character reference.");
  if (!nonEmpty(quality.reference_attachment_receipt) && required.length)
    err("QA_ATTACHMENT_UNVERIFIED","Character references must have a verified attachment receipt for this operation.");
  if (!["none","title"].includes(quality.text_policy))
    err("QA_TEXT_POLICY","Specify whether this individual scene is a title frame or is text-free.");
  if (quality.text_policy === "none" &&
      (quality.title_lines?.length || quality.source_image_has_text === true ||
       quality.reuse_title_artwork_as_scene === true))
    err("QA_TITLE_LEAK","A finished title must not leak into ordinary scenes or reference images.");
  if (quality.text_policy === "title" &&
      (!Array.isArray(quality.title_lines) || !quality.title_lines.length ||
       !quality.title_lines.every(nonEmpty)))
    err("QA_TITLE_TEXT","Supply the exact approved title text for this one title scene.");
  if (kind === "image" && (quality.output_format === "collage" || quality.multi_panel === true))
    err("QA_PANELS_FORBIDDEN","Collage or multiple-panel generation is not an individual image.");
  if (kind === "video") {
    if (!nonEmpty(quality.camera_action))
      err("QA_CAMERA_ACTION","Specify the requested camera movement for this one clip.");
    if (quality.reference_frames_are_cuts === true)
      err("QA_REFERENCE_ROLES","Guiding frames are visual waypoints, not edit cuts.");
    if (quality.exact_endpoints_required === true &&
       (quality.endpoint_controls_verified !== true ||
        !nonEmpty(quality.start_frame_asset_id) || !nonEmpty(quality.end_frame_asset_id)))
      err("QA_ENDPOINT_UNVERIFIED","Do not promise exact first/last frames without verified supported controls and attached assets.");
  }
  if (nonEmpty(quality.request_signature) &&
      previousFailedSignatures.includes(quality.request_signature) &&
      quality.user_authorised_identical_retry !== true)
    err("QA_REPEAT_FAILURE","An identical failed operation cannot run again without a changed specification or explicit user approval.");
  return { ...quality, version: QUALITY_CONTRACT_VERSION, required_character_asset_ids: [...required],
    attached_character_asset_ids: [...attached] };
}

/** No inspection = never passed. Panels, title leaks, wrong characters or wrong
 * output counts block delivery even if a model reports successful generation.
 * 'identity_approved' must come from a real authorised review, not the generator.
 */
export function assessQualityEvidence(quality,evidence) {
  if (!quality || quality.version !== QUALITY_CONTRACT_VERSION)
    return {status:"blocked",reasons:["Missing quality contract"]};
  if (!evidence || evidence.artifact_opened !== true)
    return {status:"needs_review",reasons:["The actual generated asset has not been opened and inspected"]};
  const reasons=[];
  if (evidence.output_count !== 1) reasons.push("Expected exactly one output");
  if (quality.presentation === "individual" && evidence.panel_count !== 1)
    reasons.push("A panel/grid/collage must be split into separate assets or regenerated individually");
  if (evidence.aspect_ratio_matches !== true) reasons.push("Aspect ratio not verified");
  if (quality.required_character_asset_ids.length && evidence.identity_approved !== true)
    reasons.push("Identity/reference likeness was not approved");
  if (evidence.references_actually_attached !== true &&
      quality.required_character_asset_ids.length)
    reasons.push("Required character-reference attachments not verified");
  if (quality.text_policy === "none" && evidence.has_unwanted_text !== false)
    reasons.push("Unexpected title or lettering has not been ruled out");
  if (quality.text_policy === "title" && evidence.exact_title_verified !== true)
    reasons.push("The approved title text was not verified");
  if (evidence.composition_distinct !== true)
    reasons.push("Scene/pose/camera novelty not verified");
  if (quality.output_count === 1 && evidence.single_asset_delivered !== true)
    reasons.push("A standalone image asset, rather than a sheet or fabricated link, was not verified");
  if (quality.kind === "video" && evidence.continuous_camera_verified !== true)
    reasons.push("Continuous camera motion and no-cut requirement not verified");
  return {status:reasons.length?"needs_review":"passed",reasons};
}

export const DELIVERY_STATES=Object.freeze(["requested","prepared","submitted","generated","needs_review","passed","delivered","failed"]);
export function canDeliver({quality,evidence}) {
  return assessQualityEvidence(quality,evidence).status === "passed";
}
