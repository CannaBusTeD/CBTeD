// Regression tests for the Awake Reprise mistakes. These apply to every project.
import test from "node:test";
import assert from "node:assert/strict";
import {assertQualityPreflight,assessQualityEvidence,canDeliver} from "./quality-gate.mjs";
const base=()=>({
 kind:"image",provider:"chatgpt",prompt:"Single photographic dancer in a huge room",
 quality:{version:1,scene_id:"scene-02",scene_count:1,output_count:1,presentation:"individual",
  requested_provider:"chatgpt",selected_provider:"chatgpt",
  required_character_asset_ids:["ted-asset","anne-asset"],
  attached_character_asset_ids:["ted-asset","anne-asset"],
  reference_attachment_receipt:"confirmed-for-this-operation",
  text_policy:"none",title_lines:[],request_signature:"hash-1"}
});
const good=()=>({artifact_opened:true,output_count:1,panel_count:1,aspect_ratio_matches:true,
 identity_approved:true,references_actually_attached:true,has_unwanted_text:false,
 composition_distinct:true,single_asset_delivered:true});
test("one standalone image with attached identity references passes preflight",()=>assert.ok(assertQualityPreflight(base())));
test("multiple scenes in one operation are rejected",()=>{const x=base();x.quality.scene_count=4;assert.throws(()=>assertQualityPreflight(x),/one independent scene/i);});
test("a panel layout is rejected before spending credits",()=>{const x=base();x.quality.presentation="collage";assert.throws(()=>assertQualityPreflight(x),/collages/i);});
test("missing Anne reference is a hard preflight failure",()=>{const x=base();x.quality.attached_character_asset_ids=["ted-asset"];assert.throws(()=>assertQualityPreflight(x),/each required character reference/i);});
test("a textual claim does not substitute for a real attachment receipt",()=>{const x=base();x.quality.reference_attachment_receipt="";assert.throws(()=>assertQualityPreflight(x),/verified attachment receipt/i);});
test("unapproved provider substitution is prohibited",()=>{const x=base();x.provider="runway";assert.throws(()=>assertQualityPreflight(x),/provider is locked/i);});
test("title text from prior thumbnail cannot leak into a normal image",()=>{const x=base();x.quality.title_lines=["AWAKE"];assert.throws(()=>assertQualityPreflight(x),/title must not leak/i);});
test("exact title allowed only on designated title frame",()=>{const x=base();x.quality.text_policy="title";x.quality.title_lines=["AWAKE","CANNABUSTED"];assert.ok(assertQualityPreflight(x));});
test("an identical failed rerun is blocked",()=>{const x=base();assert.throws(()=>assertQualityPreflight({...x,previousFailedSignatures:["hash-1"]}),/identical failed operation/i);});
test("failed rerun can be deliberately authorised by creator",()=>{const x=base();x.quality.user_authorised_identical_retry=true;assert.ok(assertQualityPreflight({...x,previousFailedSignatures:["hash-1"]}));});
test("no QA inspection does not pass",()=>assert.equal(assessQualityEvidence(base().quality).status,"needs_review"));
test("collage detection blocks delivery",()=>{const x=good();x.panel_count=4;assert.equal(canDeliver({quality:base().quality,evidence:x}),false);});
test("incorrect likeness blocks delivery",()=>{const x=good();x.identity_approved=false;assert.equal(canDeliver({quality:base().quality,evidence:x}),false);});
test("a normal frame with unwanted title text is blocked",()=>{const x=good();x.has_unwanted_text=true;assert.equal(canDeliver({quality:base().quality,evidence:x}),false);});
test("verified standalone image can be delivered",()=>assert.equal(canDeliver({quality:base().quality,evidence:good()}),true));
test("video guide frames must not be treated as cuts",()=>{
 const x=base();x.kind="video";x.quality.camera_action="Smooth continuous orbit";x.quality.reference_frames_are_cuts=true;
 assert.throws(()=>assertQualityPreflight(x),/visual waypoints/i);
});
test("exact endpoints require tested provider controls and actual assets",()=>{
 const x=base();x.kind="video";x.quality.camera_action="Smooth continuous orbit";x.quality.exact_endpoints_required=true;
 assert.throws(()=>assertQualityPreflight(x),/verified supported controls/i);
});
