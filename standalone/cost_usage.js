"use strict";
/* Resolve a CV application's own Token_Usage.json, on demand only.
 * This route is authenticated by server.js before any Drive calls.
 */
const DRIVE_API="https://www.googleapis.com/drive/v3/files";
function folderId(link){
  let u;
  try {u=new URL(String(link||""));}catch{return null;}
  if(u.protocol!=="https:"||u.hostname.toLowerCase()!=="drive.google.com")return null;
  const id=u.pathname.match(/^\/drive\/folders\/([A-Za-z0-9_-]{20,})(?:\/|$)/)?.[1]||
    (u.pathname==="/open"?u.searchParams.get("id"):null);
  return /^[A-Za-z0-9_-]{20,}$/.test(id||"")?id:null;
}
const amount=v=>{
  if(v===null||v===undefined||String(v).trim()==="")return null;
  const n=Number(v);return Number.isFinite(n)&&n>=0&&n<100000?n:null;
};
async function tokenUsageForJob({candidate,row,token,lookup,fetchImpl=fetch}){
  if(!["Abhishek","Pooja"].includes(candidate)||!Number.isInteger(row)||row<3)
    throw Object.assign(new Error("Invalid usage request."),{httpCode:400});
  const job=await lookup(candidate,row);
  if(!job||job.source!=="fresh"||job.row!==row||!job.url)
    throw Object.assign(new Error("Application not found."),{httpCode:404});
  const recordedUsd=amount(job.costUsd);
  const folder=folderId(job.folder);
  if(!folder)return {found:false,recordedUsd,message:"No verified application folder is available for this row."};
  const headers={Authorization:"Bearer "+token};
  const q="'"+folder+"' in parents and name = 'Token_Usage.json' and trashed = false";
  const listUrl=new URL(DRIVE_API);
  listUrl.searchParams.set("q",q);
  listUrl.searchParams.set("fields","files(id,name,mimeType,size,parents,trashed)");
  listUrl.searchParams.set("pageSize","10");
  const index=await fetchImpl(listUrl.href,{headers,signal:AbortSignal.timeout(30000)});
  if(!index.ok)throw Object.assign(new Error("Could not verify token usage file on Drive."),{httpCode:502});
  const info=await index.json();
  const found=(info.files||[]).find(x=>x&&x.name==="Token_Usage.json"&&
    /^[A-Za-z0-9_-]{20,}$/.test(x.id||"")&&x.trashed!==true&&
    Array.isArray(x.parents)&&x.parents.includes(folder)&&
    Number(x.size||0)<=1024*1024);
  if(!found)return {found:false,recordedUsd,message:"Token_Usage.json not found in the recorded application folder."};
  const url="https://drive.google.com/file/d/"+found.id+"/view";
  const raw=await fetchImpl(DRIVE_API+"/"+encodeURIComponent(found.id)+"?alt=media",
    {headers,signal:AbortSignal.timeout(30000)});
  if(!raw.ok)throw Object.assign(new Error("The token usage file cannot be read."),{httpCode:502});
  let json;
  try{json=await raw.json();}catch{
    return {found:true,url,recordedUsd,verified:false,message:"Usage file is linked but could not be parsed as JSON."};
  }
  const id=String(job.applicationId||"");
  if(String(json.candidate||"").trim().toLowerCase()!==candidate.toLowerCase()||
    (id&&json.application_id!==id)){
    return {found:true,url,recordedUsd,verified:false,message:"Usage file identity did not match this candidate/application."};
  }
  const usageUsd=amount(json.cumulative_cost_usd);
  const match=usageUsd!==null&&recordedUsd!==null&&Math.abs(usageUsd-recordedUsd)<=0.00011;
  const stages=Object.entries(json.latest_stage_usage||{}).slice(0,12)
    .map(([stage,stats])=>({stage:stage.slice(0,60),model:String(stats?.model||"").slice(0,60),costUsd:amount(stats?.cost)}))
    .filter(x=>x.costUsd!==null);
  return {found:true,url,recordedUsd,usageUsd,verified:match,stages,
    message:match?"Usage file matches Freshmaal (within stored rounding).":
      "The usage file and Freshmaal cost differ, or a cost is missing. Review the source before relying on this amount."};
}
module.exports={folderId,amount,tokenUsageForJob};
