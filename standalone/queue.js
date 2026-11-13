"use strict";
/** Query GitHub Actions from the server; never expose the GitHub secret. */
const API = "https://api.github.com/repos/abhisheknair607-ux/automate_cv/actions/workflows/controlled-cv-test.yml/runs?event=workflow_dispatch&per_page=100";
const RUN_NAME = /^CV · (abhishek|pooja) · Freshmaal #(\d+)$/i;
const PENDING = new Set(["queued","pending","requested","waiting"]);
const ACTIVE = new Set([...PENDING,"in_progress"]);
let cached = null;
let cacheExpires = 0;
let staleExpires = 0;
let inFlight = null;
const AUTH_CACHE_MS = 45000;
const PUBLIC_CACHE_MS = 120000;
const STALE_WINDOW_MS = 300000;

function classifyRuns(all) {
  const active = (all || []).filter(r => r && ACTIVE.has(r.cvJobStatus || r.status) && RUN_NAME.test(r.display_title || ""));
  // GitHub's queue order is not formally guaranteed FIFO; show position among
  // currently visible manual requests, not an ETA or guaranteed execution order.
  const queued = active.filter(r => PENDING.has(r.cvJobStatus || r.status))
    .sort((a,b) => Date.parse(a.created_at)-Date.parse(b.created_at) || a.id-b.id);
  const position = new Map(queued.map((r,i) => [r.id,i+1]));
  const byJob = {};
  for (const run of active) {
    const match = (run.display_title || "").match(RUN_NAME);
    const key = match[1].toLowerCase() + ":" + Number(match[2]);
    const candidateRun = {
      state: (run.cvJobStatus || run.status) === "in_progress" ? "running" : "queued",
      queueNumber: position.get(run.id) || null,
      url: run.html_url,
      runId: run.id
    };
    // A duplicate dispatch must not replace a currently running job indicator.
    if (!byJob[key] || (byJob[key].state !== "running" && candidateRun.state === "running"))
      byJob[key] = candidateRun;
  }
  return {byJob, running:active.filter(r=>(r.cvJobStatus || r.status)==="in_progress").length,
    queued:queued.length, checkedAt:new Date().toISOString(),
    queueNote:"Queue numbers count visible manual CV requests. Scheduled worker jobs may also delay execution."};
}

function queueError(message, githubStatus) {
  const err = Object.assign(new Error(message), {httpCode:503});
  if (githubStatus) err.githubStatus = githubStatus;
  return err;
}

async function readQueue(token, options={}) {
  const fetcher = options.fetcher || fetch;
  if (options.requireAuth && !token)
    throw queueError("GitHub queue status unavailable: dispatch credential missing");

  const headersFor = authenticated => ({
    ...(authenticated ? {"Authorization":"Bearer "+token} : {}),
    "Accept":"application/vnd.github+json",
    "X-GitHub-Api-Version":"2022-11-28",
    "User-Agent":"automate-cv-dashboard"
  });
  async function request(url, authenticated) {
    let response;
    try {
      response=await fetcher(url,{
        method:"GET",headers:headersFor(authenticated),
        signal:AbortSignal.timeout(12000)
      });
    } catch (_) {
      throw queueError("GitHub queue status unavailable: connection timed out or failed");
    }
    if (!response.ok) {
      const status=Number(response.status)||503;
      throw queueError("GitHub queue status unavailable (HTTP "+status+")",status);
    }
    return response;
  }

  let authenticated=Boolean(token);
  let response;
  try {
    response=await request(API,authenticated);
  } catch (error) {
    // Only queue viewing may use this read-only fallback; paid dispatch must
    // have a valid token and must complete a fresh authenticated duplicate check.
    if (options.requireAuth || !token) throw error;
    try {
      response=await request(API,false);
      authenticated=false;
    } catch (_) {
      throw error; // Preserve the first (authenticated) failure diagnosis.
    }
  }
  let data;
  try {data=await response.json();}
  catch (_) {throw queueError("GitHub queue response was invalid");}
  if (!data || !Array.isArray(data.workflow_runs))
    throw queueError("GitHub queue response was missing workflow runs");

  const runs=data.workflow_runs;
  // GitHub can mark a run in_progress before its actual job starts.
  const visible=runs.filter(r=>RUN_NAME.test(r?.display_title||"") && r.status==="in_progress").slice(0,20);
  await Promise.all(visible.map(async run=>{
    try {
      const detail=await request(
        "https://api.github.com/repos/abhisheknair607-ux/automate_cv/actions/runs/"+
        encodeURIComponent(String(run.id))+"/jobs?per_page=10",authenticated);
      const payload=await detail.json();
      const job=(payload.jobs||[]).find(j=>j.name==="controlled-cv")||(payload.jobs||[])[0];
      if (job && ACTIVE.has(job.status))run.cvJobStatus=job.status;
    } catch (_) {/* Retain run-level status when detail lookup fails. */}
  }));
  const result=classifyRuns(runs);
  if (!authenticated) {
    result.readOnly=true;
    result.queueNote="Live GitHub status is using a public read-only fallback. CV dispatch still requires a valid GitHub workflow token.";
  }
  return result;
}

async function getCvQueue(token, options={}) {
  // Fresh duplicate-prevention checks never use cached, stale or anonymous
  // status. Only the visual queue monitor can temporarily degrade.
  const monitoring=!options.fresh && !options.requireAuth;
  const cacheable=monitoring && !options.fetcher;
  if (cacheable && cached && Date.now()<cacheExpires)return cached;
  if (cacheable && inFlight)return inFlight;

  const attempt=async()=>{
    try {
      const result=await readQueue(token,options);
      if(cacheable){
        cached=result;
        cacheExpires=Date.now()+(result.readOnly?PUBLIC_CACHE_MS:AUTH_CACHE_MS);
        staleExpires=Date.now()+STALE_WINDOW_MS;
      }
      return result;
    } catch(error) {
      if(cacheable && cached && Date.now()<staleExpires) {
        return {...cached,stale:true,
          queueNote:"Last confirmed queue status only. GitHub cannot currently be reached; queue positions may have changed."};
      }
      throw error;
    }
  };
  if(!cacheable)return attempt();
  const pending=attempt();
  inFlight=pending;
  try{return await pending;}
  finally{if(inFlight===pending)inFlight=null;}
}
module.exports={getCvQueue,classifyRuns,RUN_NAME};
