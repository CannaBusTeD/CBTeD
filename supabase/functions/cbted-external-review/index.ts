import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const ROOT=(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");
const SECRET=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const PUB=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||"";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store","access-control-allow-origin":"*","access-control-allow-headers":"authorization,content-type,x-review-token","access-control-allow-methods":"POST,OPTIONS"}});
const check=(id)=>typeof id==="string"&&UUID.test(id);
async function api(path,method="GET",body,prefer="return=representation"){
 const r=await fetch(ROOT+"/rest/v1/"+path,{method,headers:{apikey:SECRET,Authorization:"Bearer "+SECRET,"content-type":"application/json",Prefer:prefer},body:body===undefined?undefined:JSON.stringify(body)});
 const t=await r.text();let data;try{data=t?JSON.parse(t):null}catch{throw Error("Database response invalid")}
 if(!r.ok)throw Error("Database request failed: "+r.status);
 return data;
}
async function identity(req){
 const m=/^Bearer (\S+)$/.exec(req.headers.get("authorization")||"");
 if(!m)throw Error("AUTH_REQUIRED");
 const r=await fetch(ROOT+"/auth/v1/user",{headers:{apikey:PUB||SECRET,Authorization:"Bearer "+m[1]}});
 if(!r.ok)throw Error("AUTH_REQUIRED");
 const user=await r.json();if(!check(user.id))throw Error("AUTH_REQUIRED");return user.id;
}
async function owner(project,user){
 if(!check(project))throw Error("Invalid project ID");
 const p=await api("projects?id=eq."+project+"&owner_id=eq."+user+"&select=id");
 if(!p?.length)throw Error("PROJECT_FORBIDDEN");
}
async function review(id,user){
 if(!check(id))throw Error("Invalid review ID");
 const rows=await api("review_requests?id=eq."+id+"&select=*");
 if(!rows?.length)throw Error("Review not found");
 await owner(rows[0].project_id,user);return rows[0];
}
async function hash(token){
 const bytes=new TextEncoder().encode(token);
 return [...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function guest(req){
 const token=req.headers.get("x-review-token")||"";
 if(!/^[a-f0-9]{64}$/.test(token))throw Error("INVALID_INVITATION");
 const h=await hash(token);
 const rows=await api("invitations?token_sha256=eq."+h+"&select=*");
 const i=rows?.[0];
 if(!i||i.status==="revoked"||i.status==="expired"||i.revoked_at||new Date(i.expires_at).getTime()<Date.now())throw Error("INVALID_INVITATION");
 const rs=await api("review_requests?id=eq."+i.review_id+"&select=*");
 const r=rs?.[0];
 if(!r||!["approved","inviting","in_review"].includes(r.status))throw Error("INVALID_INVITATION");
 return {i,r};
}

async function previewAsset(r){
 if(!r.output_id)return null;
 const outputs=await api("outputs?id=eq."+r.output_id+"&project_id=eq."+r.project_id+"&select=asset_id");
 const assetId=outputs?.[0]?.asset_id;
 if(!check(assetId))return null;
 const assets=await api("assets?id=eq."+assetId+"&project_id=eq."+r.project_id+"&select=storage_path,mime_type");
 const asset=assets?.[0];
 if(!asset?.storage_path)return null;
 const path=asset.storage_path.split("/").map(encodeURIComponent).join("/");
 const res=await fetch(ROOT+"/storage/v1/object/sign/cbted-project-assets/"+path,{
  method:"POST",headers:{apikey:SECRET,Authorization:"Bearer "+SECRET,"content-type":"application/json"},
  body:JSON.stringify({expiresIn:120})});
 if(!res.ok)throw Error("Cannot prepare private asset preview");
 const data=await res.json();
 const relative=data.signedURL||data.signedUrl;
 if(typeof relative!=="string")throw Error("Storage did not return a signed asset URL");
 return {mime_type:asset.mime_type,temporary_url:relative.startsWith("http")?relative:ROOT+"/storage/v1"+(relative.startsWith("/")?relative:"/"+relative),expires_in_seconds:120};
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return response({});
 if(req.method!=="POST")return response({error:"POST required"},405);
 if(!ROOT||!SECRET)return response({error:"Review service not configured"},503);
 try{
  const body=await req.json();
  const action=body?.action;
  if(action==="reviewer_get"){
   const {i,r}=await guest(req);
   return response({review_id:r.id,brief:r.brief,package:r.review_package,asset:await previewAsset(r),expires_at:i.expires_at});
  }
  if(action==="reviewer_submit"){
   const {i,r}=await guest(req);
   if(typeof body.critique!=="string"||!body.critique.trim()||body.critique.length>30000)throw Error("Invalid critique");
   if(!Array.isArray(body.recommendations)||body.recommendations.length>50)throw Error("Invalid recommendations");
   const previous=await api("feedback?invitation_id=eq."+i.id+"&select=id");
   if(previous?.length)throw Error("Feedback already submitted");
   await api("feedback","POST",{invitation_id:i.id,critique:body.critique,recommendations:body.recommendations});
   await api("invitations?id=eq."+i.id,"PATCH",{status:"accepted",accepted_at:new Date().toISOString()});
   await api("review_requests?id=eq."+r.id,"PATCH",{status:"in_review"});
   return response({received:true});
  }
  const user=await identity(req);

  if(action==="reviewers"){
   const reviewers=await api("reviewers?owner_id=eq."+user+"&select=id,display_name,provider,external_agent_id,verified,verification_note,created_at&order=created_at.desc&limit=100");
   return response({reviewers});
  }
  if(action==="reviewer_add"){
   const display_name=String(body.display_name||"").trim();
   const provider=String(body.provider||"direct").trim().toLowerCase();
   const external_agent_id=String(body.external_agent_id||"").trim();
   if(display_name.length<1||display_name.length>120||external_agent_id.length>250||!["1f916","direct","other"].includes(provider))throw Error("Invalid reviewer details");
   const rows=await api("reviewers","POST",{owner_id:user,display_name,provider,external_agent_id:external_agent_id||null,verified:false});
   return response({reviewer:rows[0],note:"Pending reviewer. Confirm identity and willingness through a trusted channel before authorising access."});
  }
  if(action==="reviewer_approve"){
   if(body.confirmed_consent!==true||!check(body.reviewer_id))throw Error("Explicit owner confirmation of independent reviewer consent is required");
   const rows=await api("reviewers?id=eq."+body.reviewer_id+"&owner_id=eq."+user+"&select=id");
   if(!rows?.length)throw Error("Reviewer not owned or missing");
   await api("reviewers?id=eq."+body.reviewer_id,"PATCH",{verified:true,verification_note:"Owner attests out-of-band consent; not cryptographically verified"});
   return response({approved:true,identity_cryptographically_verified:false});
  }
  if(action==="create"){
   await owner(body.project_id,user);
   if(!check(body.output_id))throw Error("Select a finished output");
   const outputs=await api("outputs?id=eq."+body.output_id+"&project_id=eq."+body.project_id+"&select=id,content,output_kind,asset_id");
   if(!outputs?.length)throw Error("Output not found in project");
   const brief=String(body.brief||"").slice(0,6000);
   const pack={kind:outputs[0].output_kind,content:outputs[0].content?.slice(0,40000)||"",asset_reference:outputs[0].asset_id?true:false};
   const rows=await api("review_requests","POST",{project_id:body.project_id,output_id:body.output_id,requested_by:user,brief,review_package:pack});
   return response({review:rows[0]});
  }
  if(action==="list"){
   await owner(body.project_id,user);
   const rows=await api("review_requests?project_id=eq."+body.project_id+"&select=id,project_id,output_id,status,brief,created_at,approved_at&order=created_at.desc&limit=50");
   return response({reviews:rows});
  }
  const r=await review(body.review_id,user);
  if(action==="approve"){
   if(r.status!=="draft")throw Error("Only draft reviews can be approved");
   await api("review_requests?id=eq."+r.id,"PATCH",{status:"approved",approved_at:new Date().toISOString()});
   return response({approved:true});
  }
  if(action==="invite"){
   if(!["approved","inviting","in_review"].includes(r.status))throw Error("Review needs approval");
   const reviewerId=body.reviewer_id;
   if(!check(reviewerId))throw Error("Invalid reviewer ID");
   const reviewer=await api("reviewers?id=eq."+reviewerId+"&owner_id=eq."+user+"&verified=eq.true&select=id");
   if(!reviewer?.length)throw Error("Reviewer is not verified");
   const token=[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,"0")).join("");
   const expires=new Date(Date.now()+Math.min(24,Math.max(1,Number(body.hours)||24))*3600000).toISOString();
   const rows=await api("invitations","POST",{review_id:r.id,reviewer_id:reviewerId,expires_at:expires,token_sha256:await hash(token)});
   await api("review_requests?id=eq."+r.id,"PATCH",{status:"inviting"});
   return response({invitation_id:rows[0].id,one_time_token:token,expires_at:expires});
  }
  if(action==="feedback"){
   const inv=await api("invitations?review_id=eq."+r.id+"&select=id,reviewer_id,status,expires_at");
   const ids=inv.map(x=>x.id);
   const f=ids.length?await api("feedback?invitation_id=in.("+ids.join(",")+")&select=id,invitation_id,critique,recommendations,received_at"):[];
   return response({invitations:inv,feedback:f});
  }
  if(action==="revoke"){
   if(!check(body.invitation_id))throw Error("Invalid invitation ID");
   const inv=await api("invitations?id=eq."+body.invitation_id+"&review_id=eq."+r.id+"&select=id");
   if(!inv?.length)throw Error("Invitation not found");
   await api("invitations?id=eq."+body.invitation_id,"PATCH",{status:"revoked",revoked_at:new Date().toISOString()});
   return response({revoked:true});
  }
  if(action==="complete"){
   await api("review_requests?id=eq."+r.id,"PATCH",{status:"completed"});
   return response({completed:true});
  }
  return response({error:"Unknown action"},400);
 }catch(e){
  const message=String(e?.message||"Request failed");
  const status=message==="AUTH_REQUIRED"?401:message==="PROJECT_FORBIDDEN"||message==="INVALID_INVITATION"?403:400;
  return response({error:message},status);
 }
});