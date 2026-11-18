import assert from "node:assert/strict";
import {routeSpecialist} from "../supabase/functions/_shared/specialist-router.mjs";
const edit=routeSpecialist({operation:"edit_lyrics",source_text:"A single verse"});
assert.equal(edit.studio,"writing");
assert.ok(!edit.steps.some(s=>s.key==="writing_draft"));
assert.ok(edit.steps.some(s=>s.key==="writing_edit"));
assert.ok(!edit.steps.some(s=>s.studio==="visual"));
const images=routeSpecialist({operation:"create_images",brief:"Three portraits",count:3});
assert.equal(images.steps.filter(s=>s.kind==="image").length,3);
assert.deepEqual(images.steps.filter(s=>s.kind==="image").map(s=>s.key),["visual_generate_1","visual_generate_2","visual_generate_3"]);
assert.ok(!images.steps.some(s=>s.studio==="writing"));
const song=routeSpecialist({operation:"write_song",brief:"Write a complete original song"});
assert.ok(song.steps.some(s=>s.key==="writing_draft"));
assert.ok(song.steps.some(s=>s.key==="writing_review"));
const imageId="11111111-1111-4111-8111-111111111111";
const audioId="22222222-2222-4222-8222-222222222222";
const video=routeSpecialist({operation:"make_music_video",brief:"Animate the supplied assets",image_asset_id:imageId,audio_asset_id:audioId});
assert.equal(video.studio,"animation");
assert.ok(!video.steps.some(s=>s.studio==="writing"||s.studio==="visual"));
assert.throws(()=>routeSpecialist({operation:"make_music_video",brief:"Video"}),/image_asset_id/);
assert.throws(()=>routeSpecialist({operation:"edit_lyrics",brief:"Edit"}),/supplied verse/);

const directVideo=routeSpecialist({operation:"create_video_from_idea",brief:"A short film showing cats and dogs"});
assert.equal(directVideo.studio,"animation");
assert.deepEqual(directVideo.steps.filter(s=>s.kind==="video").map(s=>s.key),["animation_generate"]);
assert.equal(directVideo.steps.find(s=>s.kind==="video").requires_approval,true);
assert.ok(!directVideo.steps.some(s=>s.studio==="writing"||s.studio==="visual"||s.studio==="audio"));
assert.ok(!directVideo.requires.includes("image_asset_id"));
assert.ok(!directVideo.requires.includes("source_text"));
assert.equal(directVideo.executed,false);
const switchToVideo=routeSpecialist({
 operation:"create_video_from_idea",previous_operation:"create_images",
 brief:"Cats and dogs playing in the rain"
});
assert.equal(switchToVideo.direction_changed,true);
assert.equal(switchToVideo.original_idea,"Cats and dogs playing in the rain");
assert.equal(switchToVideo.reuse_previous_media,false);
assert.ok(switchToVideo.skipped_studios.includes("visual"));
assert.ok(!switchToVideo.steps.some(s=>s.key.startsWith("visual_")||s.key.startsWith("writing_")));
assert.throws(()=>routeSpecialist({operation:"create_video_from_idea"}),/brief/);
assert.throws(()=>routeSpecialist({operation:"create_video_from_idea",brief:"Video",previous_operation:"unknown"}),/previous/);
console.log("PASS independent CBTeD specialist routing and direct idea-to-video switching");
