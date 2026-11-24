import test from "node:test";
import assert from "node:assert/strict";
import {readReviewAudio,inspectAudio} from "../supabase/functions/_shared/audio-review.mjs";

test("audio review sends the exact private waveform and records the source id",async()=>{
  const wav=Buffer.alloc(46);
  wav.write("RIFF"); wav.writeUInt32LE(38,4); wav.write("WAVEfmt ",8);
  wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22);
  wav.writeUInt32LE(8000,24); wav.writeUInt32LE(16000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34);
  wav.write("data",36); wav.writeUInt32LE(2,40);
  const audio=await readReviewAudio(new Response(wav),"audio/wav");
  for(const verdict of ["PASS","REPAIR","BLOCKED"]){
    const review=inspectAudio({audio,brief:"test",assetId:"fixture",rules:"",model:"fixture",request:async body=>{
      assert.deepEqual(Buffer.from(body.messages[1].content[1].input_audio.data,"base64"),wav);
      return {id:"fixture-response",choices:[{finish_reason:"stop",message:{content:JSON.stringify({verdict,findings:"Synthetic fixture finding"})}}]};
    }});
    if(verdict==="BLOCKED")await assert.rejects(review,/blocked/);
    else { const r=await review; assert.equal(r.reviewed_asset_id,"fixture"); assert.ok(r.text.startsWith("VERDICT: "+verdict+"\n")); }
  }
});
test("invalid and oversized recordings stop before provider dispatch",async()=>{
  await assert.rejects(readReviewAudio(new Response("bad"),"audio/wav"),/signature/);
  await assert.rejects(readReviewAudio(new Response("bad",{headers:{"content-length":"90000000"}}),"audio/mpeg"),/limit/);
});
