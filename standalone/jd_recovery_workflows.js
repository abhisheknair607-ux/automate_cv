"use strict";
/** Manual authenticated GitHub Actions control for full JD recovery.
 * No scheduled calls. GitHub owns execution and status; Cloud Run dispatches and polls.
 */
const REPO="abhisheknair607-ux/automate_cv";
const WORKFLOW="jd-recovery.yml";
const REF="main";
const WORKFLOW_URL="https://github.com/"+REPO+"/actions/workflows/"+WORKFLOW;
const DISPATCH_PATH="actions/workflows/"+WORKFLOW+"/dispatches";
const STATUS_PATH="actions/workflows/"+WORKFLOW+"/runs?event=workflow_dispatch&branch=main&per_page=5";
const RECENT_WINDOW_MS=90_000;
let pendingSince=0;
let dispatchInFlight=false;
function fail(message,httpCode){return Object.assign(new Error(message),{httpCode})}
function available({token,dispatchAllowed,applyAllowed,readOnly}){
 return Boolean(token&&dispatchAllowed&&applyAllowed&&!readOnly);
}
async function githubRequest(token,path,{method="GET",body,fetcher=fetch}={}){
 if(!token)throw fail("GitHub workflow token is unavailable.",503);
 if(path!==DISPATCH_PATH&&path!==STATUS_PATH)throw fail("Unexpected workflow request.",400);
 let response;
 try{
  response=await fetcher("https://api.github.com/repos/"+REPO+"/"+path,{
   method,headers:{
    Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
    "X-GitHub-Api-Version":"2022-11-28",
    ...(body?{"Content-Type":"application/json"}:{})
   },
   ...(body?{body:JSON.stringify(body)}:{}),
   signal:AbortSignal.timeout(10000)
  });
 }catch{throw fail("GitHub Actions is temporarily unreachable.",503)}
 if(!response.ok)throw fail(response.status===403?
   "GitHub token cannot access the JD recovery workflow.":
   "GitHub Actions request failed ("+response.status+").",response.status===403?403:503);
 return response.status===204?{}:await response.json().catch(()=>({}));
}
function normalize(run){
 if(!run)return null;
 const id=Number(run.id);
 const state=run.status==="completed"
   ?(run.conclusion==="success"?"completed":run.conclusion==="cancelled"?"cancelled":"failed")
   :(run.status==="in_progress"?"running":"queued");
 return {
  state,active:state==="running"||state==="queued",
  runId:Number.isSafeInteger(id)&&id>0?id:null,
  url:Number.isSafeInteger(id)&&id>0?"https://github.com/"+REPO+"/actions/runs/"+id:WORKFLOW_URL,
  startedAt:run.created_at||null,finishedAt:run.updated_at||null
 };
}
async function latest({token,fetcher}){
 const data=await githubRequest(token,STATUS_PATH,{fetcher});
 const runs=Array.isArray(data.workflow_runs)?data.workflow_runs:[];
 const own=runs.filter(r=>r.event==="workflow_dispatch"&&r.head_branch===REF&&
   (!r.path||r.path.split("@")[0].endsWith(WORKFLOW)));
 const run=own[0];
 if(run){
  const result=normalize(run);
  // GitHub may show the preceding run before the new dispatch has indexed.
  const created=Date.parse(run.created_at||"");
  if(pendingSince&&(!Number.isFinite(created)||created<pendingSince-30_000)&&
     Date.now()-pendingSince<RECENT_WINDOW_MS){
   return {state:"queued",active:true,runId:null,url:WORKFLOW_URL,
    startedAt:new Date(pendingSince).toISOString(),finishedAt:null};
  }
  if(pendingSince&&created>=pendingSince-30_000)pendingSince=0;
  return result;
 }
 if(pendingSince&&Date.now()-pendingSince<RECENT_WINDOW_MS){
  return {state:"queued",active:true,runId:null,url:WORKFLOW_URL,
   startedAt:new Date(pendingSince).toISOString(),finishedAt:null};
 }
 return {state:"idle",active:false,runId:null,url:WORKFLOW_URL,startedAt:null,finishedAt:null};
}
async function status({token,dispatchAllowed,applyAllowed,readOnly,fetcher}){
 const enabled=available({token,dispatchAllowed,applyAllowed,readOnly});
 if(!enabled)return {enabled:false,state:"disabled",active:false,runId:null,url:WORKFLOW_URL};
 return {enabled,...await latest({token,fetcher})};
}
async function dispatch({token,dispatchAllowed,applyAllowed,readOnly,fetcher}){
 if(!available({token,dispatchAllowed,applyAllowed,readOnly}))
  throw fail("JD recovery is not approved for manual execution in this environment.",403);
 if(dispatchInFlight)throw fail("JD recovery is already being requested. Check its status.",409);
 dispatchInFlight=true;
 try{
  const current=await latest({token,fetcher});
  if(current.active)throw fail("JD recovery is already queued or running. Check its status.",409);
  if(current.startedAt&&Date.now()-Date.parse(current.startedAt)<60_000)
   throw fail("JD recovery was recently started. Check its result before another run.",409);
  await githubRequest(token,DISPATCH_PATH,{
   method:"POST",body:{ref:REF,inputs:{apply:"true",limit:"25"}},fetcher
  });
  pendingSince=Date.now();
  return {accepted:true,enabled:true,state:"queued",active:true,runId:null,url:WORKFLOW_URL,
   startedAt:new Date(pendingSince).toISOString(),finishedAt:null,
   message:"JD recovery queued on GitHub. No CV or cover letter generation is started."};
 }finally{dispatchInFlight=false}
}
module.exports={available,normalize,latest,status,dispatch,WORKFLOW_URL,STATUS_PATH,DISPATCH_PATH};
