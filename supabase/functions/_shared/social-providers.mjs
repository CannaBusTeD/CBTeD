// CBTeD provider OAuth configuration. All URLs are fixed trusted platform endpoints.
// Every creator signs in themselves. Handles and URLs are only hints, never credentials.
export const PROVIDERS=Object.freeze(["youtube","facebook","instagram","tiktok","x"]);
export const META_VERSION="v25.0";
export function configuredProvider(provider,env){
 if(!PROVIDERS.includes(provider))throw Error("Unsupported social platform");
 const prefix=provider==="youtube"?"CBTED_GOOGLE":provider==="facebook"||provider==="instagram"?"CBTED_META":provider==="tiktok"?"CBTED_TIKTOK":"CBTED_X";
 const clientId=String(env.get(prefix+(provider==="tiktok"?"_CLIENT_KEY":"_CLIENT_ID"))||"");
 const clientSecret=String(env.get(prefix+"_CLIENT_SECRET")||"");
 return {provider,clientId,clientSecret,enabled:!!clientId&&!!clientSecret};
}
export function scopesFor(provider){
 switch(provider){
  case "youtube":return ["https://www.googleapis.com/auth/youtube.readonly","https://www.googleapis.com/auth/youtube.upload"];
  case "facebook":return ["pages_show_list","pages_read_engagement","pages_manage_posts"];
  case "instagram":return ["pages_show_list","pages_read_engagement","instagram_basic","instagram_content_publish"];
  case "tiktok":return ["user.info.basic","video.publish"];
  case "x":return ["tweet.read","tweet.write","users.read","offline.access"];
  default:throw Error("Unsupported social platform");
 }
}
export function providerAuthorisationUrl({provider,clientId,redirectUri,state,challenge}){
 if(!PROVIDERS.includes(provider)||!clientId||!state||!redirectUri.startsWith("https://"))throw Error("Invalid OAuth request");
 let url;
 const scopes=scopesFor(provider);
 if(provider==="youtube"){
  url=new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id",clientId);
  url.searchParams.set("scope",scopes.join(" "));
  url.searchParams.set("access_type","offline");
  url.searchParams.set("prompt","consent");
 }else if(provider==="facebook"||provider==="instagram"){
  url=new URL("https://www.facebook.com/"+META_VERSION+"/dialog/oauth");
  url.searchParams.set("client_id",clientId);
  url.searchParams.set("scope",scopes.join(","));
 }else if(provider==="tiktok"){
  url=new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.searchParams.set("client_key",clientId);
  url.searchParams.set("scope",scopes.join(","));
 }else{
  url=new URL("https://twitter.com/i/oauth2/authorize");
  url.searchParams.set("client_id",clientId);
  url.searchParams.set("scope",scopes.join(" "));
 }
 url.searchParams.set("response_type","code");
 url.searchParams.set("redirect_uri",redirectUri);
 url.searchParams.set("state",state);
 if(provider==="x"||provider==="youtube"){
  if(!challenge)throw Error("PKCE required");
  url.searchParams.set("code_challenge",challenge);
  url.searchParams.set("code_challenge_method","S256");
 }
 return url.toString();
}
export function providerTokenEndpoint(provider){
 if(provider==="youtube")return "https://oauth2.googleapis.com/token";
 if(provider==="tiktok")return "https://open.tiktokapis.com/v2/oauth/token/";
 if(provider==="x")return "https://api.x.com/2/oauth2/token";
 if(provider==="facebook"||provider==="instagram")return "https://graph.facebook.com/"+META_VERSION+"/oauth/access_token";
 throw Error("Unsupported social platform");
}
export function parseGrantedScopes(provider,raw){
 if(Array.isArray(raw))return raw.filter(x=>typeof x==="string");
 if(typeof raw!=="string")return [];
 return raw.split(provider==="facebook"||provider==="instagram"||provider==="tiktok"?",":/[,\s]+/).map(s=>s.trim()).filter(Boolean);
}
export function canPost(provider,grantedScopes){
 const granted=new Set(grantedScopes);
 return provider==="youtube"?granted.has("https://www.googleapis.com/auth/youtube.upload")
 :provider==="facebook"?granted.has("pages_manage_posts")
 :provider==="instagram"?granted.has("instagram_content_publish")
 :provider==="tiktok"?granted.has("video.publish")
 :provider==="x"?granted.has("tweet.write"):false;
}
export function isValidProvider(provider){return PROVIDERS.includes(provider)}
