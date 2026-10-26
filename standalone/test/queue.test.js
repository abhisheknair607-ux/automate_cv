"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {classifyRuns,getCvQueue}=require("../queue");

const job=(id,candidate,row,status,when)=>({
  id, display_title:"CV · "+candidate+" · Freshmaal #"+row,
  status,created_at:when,html_url:"https://github.com/example/actions/runs/"+id,
});

test("Queue positions track actual queued manual runs without inventing other job positions",()=>{
  const q=classifyRuns([
    job(30,"abhishek",76,"in_progress","2026-10-14T12:00:00Z"),
    job(31,"pooja",44,"queued","2026-10-14T12:01:00Z"),
    job(32,"abhishek",77,"queued","2026-10-14T12:02:00Z"),
    job(33,"pooja",99,"completed","2026-10-14T12:03:00Z"),
    {id:40,display_title:"controlled-cv-test",status:"queued"},
  ]);
  assert.equal(q.running,1);
  assert.equal(q.queued,2);
  assert.equal(q.byJob["abhishek:76"].state,"running");
  assert.equal(q.byJob["pooja:44"].queueNumber,1);
  assert.equal(q.byJob["abhishek:77"].queueNumber,2);
  assert.equal(q.byJob["pooja:99"],undefined);
});

test("GitHub access token never appears in queue response", async()=>{
  const q=await getCvQueue("secret-token",{
    fetcher:async(_url,opts)=>{
      assert.equal(opts.headers.Authorization,"Bearer secret-token");
      return {ok:true,json:async()=>({workflow_runs:[job(7,"pooja",12,"queued","2026-10-14T09:00:00Z")]})};
    },
  });
  assert.equal(q.byJob["pooja:12"].queueNumber,1);
  assert.doesNotMatch(JSON.stringify(q),/secret-token/);
});

test("GitHub failure refuses to invent queue positions",async()=>{
  await assert.rejects(
    getCvQueue("token",{fetcher:async()=>({ok:false,status:403})}),/HTTP 403/
  );
});
