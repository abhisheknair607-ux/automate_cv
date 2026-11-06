"use strict";
// Starts no browser-side worker. Authenticated app open checks the server's
// shared Firestore lock; only a running GitHub workflow is watched temporarily.
(function(){
 let checking=false,lastCheck=0,timer=null,remaining=0,baseline=null;
 const request=(path)=>window.__cvStandalone?.requestSpecial?.(path,{});
 function stop(){if(timer)clearTimeout(timer);timer=null;remaining=0;}
 function watch(previousSuccessAt){
  stop();
  baseline=previousSuccessAt||null;
  remaining=28; // At most 14 minutes of status checks for a 12-minute workflow.
  async function poll(){
   timer=null;
   if(document.hidden)return;
   try{
    const result=await request("alerts/auto/status");
    if(!result?.enabled)return;
    if(result.status==="succeeded"&&result.lastSuccessAt&&result.lastSuccessAt!==baseline){
     window.dispatchEvent(new Event("garamaal:jobs-imported"));
     return;
    }
    if(!["running","dispatching"].includes(result.status))return;
   }catch(e){
    console.warn("[job-import-status] "+String(e?.message||"Unavailable").slice(0,140));
   }
   if(--remaining>0)timer=setTimeout(poll,30000);
  }
  timer=setTimeout(poll,30000);
 }
 async function checkOpen(){
  if(document.hidden||checking||!window.__cvStandalone?.requestSpecial)return;
  if(Date.now()-lastCheck<60000)return;
  lastCheck=Date.now();checking=true;
  try{
   const state=await request("alerts/auto/check");
   if(state?.enabled&&state.reason==="started")watch(null);
   else if(state?.enabled&&state.reason==="running")watch(state.lastSuccessAt);
  }catch(e){
   // Job listings load normally if importer auth, GitHub or Firestore fails.
   console.warn("[job-import] "+String(e?.message||"Unavailable").slice(0,140));
  }finally{checking=false;}
 }
 window.addEventListener("pageshow",checkOpen);
 document.addEventListener("visibilitychange",()=>{
  if(!document.hidden)checkOpen();
  else stop();
 });
 checkOpen();
})();
