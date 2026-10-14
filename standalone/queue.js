"use strict";
/** Query GitHub Actions from the server; never expose the GitHub secret. */
const API = "https://api.github.com/repos/abhisheknair607-ux/automate_cv/actions/workflows/controlled-cv-test.yml/runs?event=workflow_dispatch&per_page=100";
const RUN_NAME = /^CV · (abhishek|pooja) · Freshmaal #(\d+)$/i;
const PENDING = new Set(["queued","pending","requested","waiting"]);
const ACTIVE = new Set([...PENDING,"in_progress"]);
let cached = null;
let cacheExpires = 0;

function classifyRuns(all) {
  const active = (all || []).filter(r => r && ACTIVE.has(r.status) && RUN_NAME.test(r.display_title || ""));
  // GitHub's queue order is not formally guaranteed FIFO; show position among
  // currently visible manual requests, not an ETA or guaranteed execution order.
  const queued = active.filter(r => PENDING.has(r.status))
    .sort((a,b) => Date.parse(a.created_at)-Date.parse(b.created_at) || a.id-b.id);
  const position = new Map(queued.map((r,i) => [r.id,i+1]));
  const byJob = {};
  for (const run of active) {
    const match = (run.display_title || "").match(RUN_NAME);
    const key = match[1].toLowerCase() + ":" + Number(match[2]);
    const candidateRun = {
      state: run.status === "in_progress" ? "running" : "queued",
      queueNumber: position.get(run.id) || null,
      url: run.html_url,
      runId: run.id
    };
    // A duplicate dispatch must not replace a currently running job indicator.
    if (!byJob[key] || (byJob[key].state !== "running" && candidateRun.state === "running"))
      byJob[key] = candidateRun;
  }
  return {byJob, running:active.filter(r=>r.status==="in_progress").length,
    queued:queued.length, checkedAt:new Date().toISOString(),
    queueNote:"Queue numbers count visible manual CV requests. Scheduled worker jobs may also delay execution."};
}

async function getCvQueue(token, options={}) {
  if (!token) throw Object.assign(new Error("GitHub queue status unavailable: dispatch credential missing"),{httpCode:503});
  if (cached && Date.now() < cacheExpires) return cached;
  const fetcher = options.fetcher || fetch;
  let response;
  try {
    response = await fetcher(API,{
      method:"GET",
      headers:{"Authorization":"Bearer "+token, "Accept":"application/vnd.github+json",
        "X-GitHub-Api-Version":"2022-11-28", "User-Agent":"automate-cv-dashboard"},
      signal: AbortSignal.timeout(12000)
    });
  } catch (_) {
    throw Object.assign(new Error("GitHub queue status is temporarily unavailable"),{httpCode:503});
  }
  if (!response.ok) throw Object.assign(new Error("GitHub queue status unavailable (HTTP "+response.status+")"),{httpCode:503});
  let data;
  try {data = await response.json();}
  catch (_) {throw Object.assign(new Error("GitHub queue response was invalid"),{httpCode:503});}
  const result = classifyRuns(data.workflow_runs);
  if (!options.fetcher){cached=result;cacheExpires=Date.now()+8000;}
  return result;
}
module.exports={getCvQueue,classifyRuns,RUN_NAME};
