// CBTeD social account discovery. Suggestions are NOT verified accounts or OAuth grants.
// A user handle never serves as proof of account ownership.
export const SOCIAL_PROVIDERS=Object.freeze([
  {id:"youtube",label:"YouTube"},
  {id:"facebook",label:"Facebook"},
  {id:"instagram",label:"Instagram"},
  {id:"tiktok",label:"TikTok"}
]);
const allowed=/^[\p{L}\p{N}._-]{1,60}$/u;
export function normaliseSocialHandle(value){
  const raw=String(value??"").trim();
  const clean=raw.replace(/^@/,"").replace(/\s+/gu,"");
  if(!allowed.test(clean))throw Error("Enter a username using letters, numbers, full stops, underscores or hyphens.");
  return {handle:clean,spacingRemoved:/\s/.test(raw),changed:clean!==raw.replace(/^@/,"")};
}
export function suggestedSocialProfiles(input,overrides={}){
  const common=normaliseSocialHandle(input);
  return SOCIAL_PROVIDERS.map(({id,label})=>{
    const resolved=overrides[id]?normaliseSocialHandle(overrides[id]):common;
    const handle=resolved.handle;
    const encoded=encodeURIComponent(handle);
    const address={
      youtube:"https://www.youtube.com/@"+encoded,
      facebook:"https://www.facebook.com/"+encoded,
      instagram:"https://www.instagram.com/"+encoded+"/",
      tiktok:"https://www.tiktok.com/@"+encoded
    }[id];
    return {id,label,handle,address,verified:false,connected:false,scopes_granted:[],profile_suggestion_only:true};
  });
}
export function publishingEnabled(account){
  return Boolean(account&&account.verified===true&&account.connected===true&&account.post_permission===true&&account.status==="active");
}
export function safeConsentUrl(url){
  let u;try{u=new URL(url)}catch{return false}
  if(u.protocol!=="https:"||u.username||u.password)return false;
  return ["accounts.google.com","www.facebook.com","www.instagram.com","www.tiktok.com"].includes(u.hostname) && !u.port;
}
