// CBTeD social account discovery. Suggestions are NOT verified accounts or OAuth grants.
// A user handle never serves as proof of account ownership.
export const SOCIAL_PROVIDERS=Object.freeze([
  {id:"youtube",label:"YouTube"},
  {id:"facebook",label:"Facebook"},
  {id:"instagram",label:"Instagram"},
  {id:"tiktok",label:"TikTok"},
  {id:"x",label:"X"}
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
      tiktok:"https://www.tiktok.com/@"+encoded,
      x:"https://x.com/"+encoded
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
  return ["accounts.google.com","www.facebook.com","facebook.com","www.instagram.com","www.tiktok.com","twitter.com","x.com"].includes(u.hostname) && !u.port;
}

// A pasted social URL is a hint for which account to request permission from.
// Only the provider's later OAuth response confirms who actually owns the account.
export function parseSocialProfileInput(input){
 const raw=String(input??"").trim();
 if(!/^https?:\/\//i.test(raw))return {provider:null,handle:normaliseSocialHandle(raw).handle,address:null};
 let u;try{u=new URL(raw)}catch{throw Error("Enter a valid account address")}
 if(u.protocol!=="https:"||u.username||u.password||u.port)throw Error("Use an HTTPS profile address");
 const host=u.hostname.toLowerCase().replace(/^www\./,"").replace(/^m\./,"");
 const provider=host==="youtube.com"?"youtube":host==="facebook.com"?"facebook":host==="instagram.com"?"instagram":host==="tiktok.com"?"tiktok":host==="x.com"||host==="twitter.com"?"x":null;
 if(!provider)throw Error("This is not a supported social platform profile address");
 const pieces=u.pathname.split("/").filter(Boolean);
 let value=pieces[0]||"";
 if(provider==="youtube"&&value==="channel"&&pieces[1])return {provider,handle:null,address:"https://www.youtube.com/channel/"+encodeURIComponent(pieces[1])};
 if(provider==="youtube"&&value.startsWith("@"))value=value.slice(1);
 if(provider==="tiktok"&&value.startsWith("@"))value=value.slice(1);
 if(provider==="facebook"&&value==="profile.php"&&u.searchParams.get("id"))return {provider,handle:null,address:"https://www.facebook.com/profile.php?id="+encodeURIComponent(u.searchParams.get("id"))};
 const reserved=new Set(["login","oauth","auth","settings","home","explore","search","watch","videos","reels","reel"]);
 if(reserved.has(value.toLowerCase()))throw Error("Enter a profile link, not a login or feed link");
 const handle=normaliseSocialHandle(value).handle;
 return {provider,handle,address:u.origin+u.pathname};
}
