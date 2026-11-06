"use strict";
// Minimal app-open importer: reuses existing GitHub Actions Gmail+Taaza worker.
// The browser never receives a GitHub token. Firestore is the single cooldown lock.
const {randomUUID}=require("node:crypto");
const alertWorkflows=require("./alert_workflows");
const DOC="garamaalSystem/gmailAutoImportActionsV1";
const FOUR_HOURS=4*60*60*1000;
const LEASE=45*60*1000;
const RETRY=10*60*1000;
const WORKFLOW="linkedin-alerts-to-taaza.yml";
const PREFIX="Garamaal auto import [";
const RUN_LIST="actions/workflows/"+WORKFLOW+"/runs?event=workflow_dispatch&branch=main&per_page=100";
const asMillis=v=>Number.isFinite(Date.parse(String(v||"")))?Date.parse(String(v)):0;
const at=ms=>new Date(ms).toISOString();
function dateInDublin(now){
 const parts=new Intl.DateTimeFormat("en-GB",{
  timeZone:"Europe/Dublin",year:"numeric",month:"2-digit",day:"2-digit"
 }).formatToParts(new Date(now));
 const get=k=>parts.find(p=>p.type===k)?.value;
 return get("year")+"-"+get("month")+"-"+get("day");
}
function inputRange(lastSuccessAt,now){
 const elapsed=lastSuccessAt?Math.ceil(Math.max(0,now-asMillis(lastSuccessAt))/86400000)+2:7;
 const days=Math.min(90,Math.max(7,elapsed));
 const end=dateInDublin(now);
 const start=at(Date.parse(end+"T00:00:00Z")-(days-1)*86400000).slice(0,10);
 return {start_date:start,end_date:end,on_date:""};
}
function publicState(state,now=Date.now()){
 const lastSuccessAt=state.lastSuccessAt||null;
 const status=state.status||"idle";
 return {enabled:true,status,lastSuccessAt,
  nextDueAt:lastSuccessAt?at(asMillis(lastSuccessAt)+FOUR_HOURS):null,
  retryAt:asMillis(state.retryAt)>now?state.retryAt:null,
  lastError:state.lastError||null,
  lastRunAt:state.lastRunAt||null};
}
function makeCoordinator({db,token,enabled,github=alertWorkflows.github,clock=()=>Date.now()}){
 const ref=db.doc(DOC);
 async function modifyIfRun(id,patch){
  return db.runTransaction(async tx=>{
   const snap=await tx.get(ref),data=snap.exists?(snap.data()||{}):{};
   if(data.runId!==id)return false;
   tx.set(ref,patch,{merge:true});
   return true;
  });
 }
 async function fail(id,now){
  return modifyIfRun(id,{status:"failed",runId:null,leaseUntil:null,
   retryAt:at(now+RETRY),lastError:"Import failed; will retry on an eligible opening"});
 }
 async function status(){
  if(!enabled||!token)return {enabled:false,status:"disabled"};
  const snap=await ref.get(),data=snap.exists?(snap.data()||{}):{};
  const now=clock();
  if(data.runId&&["running","dispatching"].includes(data.status)){
   const id=data.runId;
   // Do not assume that dispatch acceptance means the job actually succeeded.
   if(data.status==="running"){
    try{
     const runs=await github(token,RUN_LIST);
     const job=(runs.workflow_runs||[]).find(r=>r.display_title===PREFIX+id+"]");
     if(job&&job.status==="completed"){
      if(job.conclusion==="success"){
       const completedAt=asMillis(job.updated_at)||now;
       await modifyIfRun(id,{status:"succeeded",runId:null,leaseUntil:null,
        retryAt:null,lastSuccessAt:at(Math.min(now,completedAt)),
        lastRunAt:at(now),lastError:null,workflowUrl:job.html_url||null});
      }else{
       await fail(id,now);
      }
     }
    }catch(err){
     // GitHub status outages must not launch another write or discard the lock.
     if(asMillis(data.leaseUntil)>now)return {...publicState(data,now),reason:"running"};
    }
   }
   if(asMillis(data.leaseUntil)<=now){
    await fail(id,now);
   }
  }
  const latest=await ref.get();
  return publicState(latest.exists?(latest.data()||{}):{},clock());
 }
 async function check(){
  if(!enabled||!token)return {enabled:false,status:"disabled"};
  await status(); // Finalize any completed run before checking its 4-hour cooldown.
  const now=clock(),id=randomUUID();
  const claim=await db.runTransaction(async tx=>{
   const snap=await tx.get(ref),data=snap.exists?(snap.data()||{}):{};
   if(data.runId&&asMillis(data.leaseUntil)>now&&
      ["running","dispatching"].includes(data.status))
    return {ok:false,reason:"running"};
   if(asMillis(data.lastSuccessAt)&&now-asMillis(data.lastSuccessAt)<FOUR_HOURS)
    return {ok:false,reason:"cooldown"};
   if(asMillis(data.retryAt)>now)return {ok:false,reason:"retry-backoff"};
   tx.set(ref,{status:"dispatching",runId:id,startedAt:at(now),
    leaseUntil:at(now+LEASE),retryAt:null,lastError:null},{merge:true});
   return {ok:true,lastSuccessAt:data.lastSuccessAt||null};
  });
  if(!claim.ok)return {...await status(),reason:claim.reason};
  const inputs={...inputRange(claim.lastSuccessAt,now),
   auto_run_id:id,apply:"true",approval:"IMPORT_VALIDATED_JOBS"};
  try{
   await github(token,"actions/workflows/"+WORKFLOW+"/dispatches",
    {method:"POST",body:{ref:"main",inputs}});
   await modifyIfRun(id,{status:"running"});
   return {...await status(),reason:"started"};
  }catch(err){
   await fail(id,clock());
   throw err;
  }
 }
 return {status,check};
}
module.exports={DOC,FOUR_HOURS,LEASE,RETRY,inputRange,publicState,makeCoordinator};
