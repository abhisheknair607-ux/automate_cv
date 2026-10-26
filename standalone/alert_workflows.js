"use strict";
/** Authenticated GitHub Actions dispatch for the Garamaal Master Controls.
 * Runs Python on GitHub, never OpenAI. No GitHub token reaches the browser.
 * A dispatch is not a completed run. No workflow runs without explicit flags.
 */
const REPO="abhisheknair607-ux/automate_cv";
const REF="main";
const WORKFLOWS=Object.freeze({
 preview:"linkedin-alerts-to-taaza.yml",
 dedupe:"taaza-dedupe-check.yml",
 apply:"linkedin-alerts-to-taaza.yml"
});
function error(msg,status){return Object.assign(new Error(msg),{httpCode:status})}
function validateDate(value){
 const date=String(value||"2026-10-25");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+"T00:00:00Z"))
   ||new Date(date+"T00:00:00Z").toISOString().slice(0,10)!==date)
  throw error("Select a valid YYYY-MM-DD date",400);
 return date;
}
function available({dispatchAllowed,applyAllowed,token}){
 return {previewEnabled:Boolean(dispatchAllowed&&token),
   dedupeEnabled:Boolean(dispatchAllowed&&token),
   applyEnabled:Boolean(dispatchAllowed&&applyAllowed&&token)};
}
async function github(token,path,{method="GET",body,fetcher=fetch}={}){
 if(!token)throw error("GitHub workflow token is unavailable",503);
 const url="https://api.github.com/repos/"+REPO+"/"+path;
 const response=await fetcher(url,{
  method,headers:{
    Accept:"application/vnd.github+json",
    Authorization:"Bearer "+token,
    "X-GitHub-Api-Version":"2022-11-28",
    ...(body?{"Content-Type":"application/json"}:{})
  },
  ...(body?{body:JSON.stringify(body)}:{}),
  signal:AbortSignal.timeout(12000)
 });
 const obj=response.status===204?{}:await response.json().catch(()=>({}));
 if(!response.ok)throw error(
  response.status===403?"GitHub token cannot trigger this workflow; check permissions.":
  "GitHub workflow request failed ("+response.status+")",
  response.status===403?403:503
 );
 return obj;
}
async function dispatch({kind,date,token,dispatchAllowed,applyAllowed,confirmed=false,fetcher}){
 if(!Object.hasOwn(WORKFLOWS,kind))throw error("Unknown workflow request",400);
 if(!dispatchAllowed)throw error("GitHub workflow control is not activated",403);
 if(kind==="apply"&&!applyAllowed)throw error("Manual import has not been activated",403);
 if(kind==="apply"&&!confirmed)throw error("Confirm the import before writing validated jobs",400);
 const inputs=kind==="dedupe"?{}:{apply:String(kind==="apply"),on_date:validateDate(date),
  ...(kind==="apply"?{approval:"IMPORT_VALIDATED_JOBS"}:{})};
 await github(token,"actions/workflows/"+WORKFLOWS[kind]+"/dispatches",{
  method:"POST",body:{ref:REF,inputs},fetcher});
 return {accepted:true,kind,message:"GitHub accepted dispatch; completion has not been confirmed",
  url:"https://github.com/"+REPO+"/actions/workflows/"+WORKFLOWS[kind]};
}
async function latest({token,fetcher}){
 const result={};
 for(const [kind,workflow] of [["preview",WORKFLOWS.preview],["dedupe",WORKFLOWS.dedupe]]){
  const data=await github(token,"actions/workflows/"+workflow+"/runs?per_page=1&branch=main",
   {fetcher});
  const run=(data.workflow_runs||[])[0];
  result[kind]=run?{status:run.status,conclusion:run.conclusion,
    runId:run.id,url:run.html_url,createdAt:run.created_at}:null;
 }
 return result;
}
module.exports={validateDate,available,github,dispatch,latest,WORKFLOWS};
