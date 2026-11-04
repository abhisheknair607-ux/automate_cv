"use strict";
/**
 * Shared, on-open Gmail import coordinator.
 * No browser timers, GitHub dispatch, or cron. The Firestore transaction is
 * the only authority for the four-hour interval across users and instances.
 */
const {randomUUID}=require("node:crypto");
const {GoogleAuth}=require("google-auth-library");

const DOC_PATH="garamaalSystem/gmailAutoImportV1";
const INTERVAL_MS=4*60*60*1000;
const LEASE_MS=45*60*1000;
const FAILURE_BACKOFF_MS=10*60*1000;
const CLOUD_SCOPE="https://www.googleapis.com/auth/cloud-platform";
const error=(message,httpCode=503)=>Object.assign(new Error(message),{httpCode});

function validDate(value){
 const n=Date.parse(String(value||""));
 return Number.isFinite(n)?n:0;
}
function publicState(doc,now=Date.now()){
 const lastSuccessAt=doc?.lastSuccessAt||null;
 const busy=!!(doc?.runId&&validDate(doc.leaseUntil)>now&&["dispatching","running"].includes(doc.status));
 const retryAt=doc?.retryAt||null;
 const nextDueAt=lastSuccessAt?new Date(validDate(lastSuccessAt)+INTERVAL_MS).toISOString():null;
 const proposals=Array.isArray(doc?.duplicates?.items)?doc.duplicates.items:[];
 return {
  enabled:true,status:busy?doc.status:(doc?.status||"idle"),
  lastSuccessAt,nextDueAt,retryAt:validDate(retryAt)>now?retryAt:null,
  lastError:doc?.lastError||null,
  added:Number(doc?.lastResult?.added||0),
  skippedDuplicates:Number(doc?.lastResult?.duplicates||0),
  needsReview:Number(doc?.lastResult?.review_jobs||0),
  duplicateCount:Number(doc?.duplicates?.count||0),
  duplicates:proposals.slice(0,40).map(p=>({
   row:p.row,company:p.company,title:p.title,matchedWith:p.matchedWith,
   reason:p.reason,recommendation:p.recommendation
  }))
 };
}
function disabledState(){return {enabled:false,status:"disabled",duplicates:[],duplicateCount:0}}

/** Claim with a transaction: multiple concurrent app opens produce ONE runner. */
async function claim(db,{now=Date.now(),id=randomUUID()}={}){
 const ref=db.doc(DOC_PATH);
 return db.runTransaction(async tx=>{
  const snap=await tx.get(ref),data=snap.exists?(snap.data()||{}):{};
  const current=publicState(data,now);
  if(data.runId&&validDate(data.leaseUntil)>now&&["dispatching","running"].includes(data.status))
   return {claimed:false,reason:"running",data:current};
  if(validDate(data.lastSuccessAt)&&now-validDate(data.lastSuccessAt)<INTERVAL_MS)
   return {claimed:false,reason:"cooldown",data:current};
  if(validDate(data.retryAt)>now)
   return {claimed:false,reason:"retry-backoff",data:current};
  tx.set(ref,{
   status:"dispatching",runId:id,startedAt:new Date(now).toISOString(),
   leaseUntil:new Date(now+LEASE_MS).toISOString(),
   retryAt:null,lastError:null
  },{merge:true});
  return {claimed:true,id,data:{...current,status:"dispatching"}};
 });
}
async function updateForRun(db,id,patch,required){
 const ref=db.doc(DOC_PATH);
 return db.runTransaction(async tx=>{
  const snap=await tx.get(ref);
  const data=snap.exists?(snap.data()||{}):{};
  if(data.runId!==id||required&&!required.includes(data.status))return false;
  tx.set(ref,patch,{merge:true});
  return true;
 });
}
/** Run a pre-provisioned Cloud Run Job; never place OAuth secrets in overrides. */
async function runCloudJob({project,region="europe-west1",job,runId,auth}){
 if(!/^[a-z][a-z0-9-]{0,62}$/.test(job||"")||
    !/^[a-z][a-z0-9-]{0,62}$/.test(project||"")||
    !/^[a-z][a-z0-9-]{0,62}$/.test(region||""))
  throw error("Automatic import Cloud Run Job is not configured",503);
 const client=auth||new GoogleAuth({scopes:[CLOUD_SCOPE]});
 const token=await (await client.getClient()).getAccessToken();
 const access=typeof token==="string"?token:token.token;
 if(!access)throw error("Cannot authenticate to Cloud Run Jobs",503);
 const uri="https://run.googleapis.com/v2/projects/"+project+"/locations/"+region+"/jobs/"+job+":run";
 const response=await fetch(uri,{
  method:"POST",
  headers:{"Authorization":"Bearer "+access,"Content-Type":"application/json"},
  body:JSON.stringify({overrides:{containerOverrides:[{env:[{name:"GARAMAAL_AUTO_RUN_ID",value:runId}]}]}}),
  signal:AbortSignal.timeout(20000)
 });
 const payload=await response.json().catch(()=>({}));
 if(!response.ok)throw error("Cloud Run Job could not start (HTTP "+response.status+")",503);
 return {operation:typeof payload.name==="string"?payload.name:"submitted"};
}
function makeCoordinator({db,runJob,enabled=true,clock=()=>Date.now()}){
 async function status(){
  if(!enabled)return disabledState();
  const snap=await db.doc(DOC_PATH).get();
  return publicState(snap.exists?snap.data():{},clock());
 }
 async function check(){
  if(!enabled)return disabledState();
  const now=clock(),claimResult=await claim(db,{now});
  if(!claimResult.claimed)return {...claimResult.data,reason:claimResult.reason};
  try{
   const result=await runJob({runId:claimResult.id});
   await updateForRun(db,claimResult.id,{
    status:"running",execution:result.operation||"submitted"
   },["dispatching"]);
   return {...await status(),reason:"started"};
  }catch(err){
   await updateForRun(db,claimResult.id,{
    status:"failed",runId:null,leaseUntil:null,
    retryAt:new Date(now+FAILURE_BACKOFF_MS).toISOString(),
    lastError:"Importer launch failed"
   },["dispatching"]);
   throw err;
  }
 }
 return {check,status};
}
module.exports={
 DOC_PATH,INTERVAL_MS,LEASE_MS,FAILURE_BACKOFF_MS,
 validDate,publicState,claim,updateForRun,runCloudJob,makeCoordinator
};
