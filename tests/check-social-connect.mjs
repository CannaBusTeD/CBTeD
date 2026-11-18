import test from "node:test";
import assert from "node:assert/strict";
import {normaliseSocialHandle,suggestedSocialProfiles,publishingEnabled,safeConsentUrl,parseSocialProfileInput} from "../app/social-connect.mjs";

test("one username prepares five suggestions, not verified accounts",()=>{
 const profiles=suggestedSocialProfiles("@CannaBusTeD");
 assert.deepEqual(profiles.map(p=>p.id),["youtube","facebook","instagram","tiktok","x"]);
 assert.equal(profiles[0].address,"https://www.youtube.com/@CannaBusTeD");
 assert.equal(profiles[1].address,"https://www.facebook.com/CannaBusTeD");
 assert.equal(profiles[2].address,"https://www.instagram.com/CannaBusTeD/");
 assert.equal(profiles[3].address,"https://www.tiktok.com/@CannaBusTeD");
 assert.equal(profiles[4].address,"https://x.com/CannaBusTeD");
 assert.ok(profiles.every(p=>p.verified===false&&p.connected===false&&p.profile_suggestion_only===true));
});
test("dictated spaces are handled but flagged for user confirmation",()=>{
 const value=normaliseSocialHandle("Canna Bus TeD");
 assert.equal(value.handle,"CannaBusTeD");
 assert.equal(value.spacingRemoved,true);
});
test("per-platform override never silently changes other accounts",()=>{
 const p=suggestedSocialProfiles("oneartist",{instagram:"another.artist"});
 assert.equal(p[2].address,"https://www.instagram.com/another.artist/");
 assert.equal(p[0].handle,"oneartist");
});
test("unsafe input and URL values cannot turn a profile suggestion into a redirect",()=>{
 for(const value of ["","/evil","user/../admin","user?q=x","https://evil.test","@a@b"]){
  assert.throws(()=>normaliseSocialHandle(value));
 }
 for(const url of ["https://fake.example/authorize","http://accounts.google.com/oauth","https://accounts.google.com.evil.test/","javascript:alert(1)","https://x:y@www.facebook.com/"]){
  assert.equal(safeConsentUrl(url),false,url);
 }
 for(const url of ["https://accounts.google.com/o/oauth2/v2/auth","https://www.facebook.com/v25.0/dialog/oauth","https://www.instagram.com/oauth/authorize","https://www.tiktok.com/v2/auth/authorize/","https://twitter.com/i/oauth2/authorize"]){
  assert.equal(safeConsentUrl(url),true,url);
 }
});
test("a handle alone never authorises publishing",()=>{
 assert.equal(publishingEnabled({handle:"CannaBusTeD"}),false);
 assert.equal(publishingEnabled({verified:true,connected:true,post_permission:false,status:"active"}),false);
 assert.equal(publishingEnabled({verified:true,connected:true,post_permission:true,status:"expired"}),false);
 assert.equal(publishingEnabled({verified:true,connected:true,post_permission:true,status:"active"}),true);
});
console.log("CBTeD social handle discovery tests passed; no OAuth success is assumed.");

test("pasted social addresses identify the correct target without pretending to authenticate",()=>{
 const fb=parseSocialProfileInput("https://www.facebook.com/CannaBusTeD");
 assert.equal(fb.provider,"facebook");assert.equal(fb.handle,"CannaBusTeD");
 const channel=parseSocialProfileInput("https://www.youtube.com/channel/UC123456789");
 assert.equal(channel.provider,"youtube");assert.equal(channel.handle,null);
 assert.equal(parseSocialProfileInput("https://x.com/CannaBusTeD").provider,"x");
 assert.equal(parseSocialProfileInput("https://www.tiktok.com/@CannaBusTeD").handle,"CannaBusTeD");
 assert.throws(()=>parseSocialProfileInput("https://www.facebook.com.evil.example/CannaBusTeD"),/supported/);
 assert.throws(()=>parseSocialProfileInput("https://www.facebook.com/login"),/profile/);
});
