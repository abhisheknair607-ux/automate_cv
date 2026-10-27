"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {available,normalize,dispatch,status,STATUS_PATH,DISPATCH_PATH}=require("../jd_recovery_workflows");
const root=path.resolve(__dirname,"../..");
const flags={token:"mock-server-side-token",dispatchAllowed:true,applyAllowed:true,readOnly:false};
function response(status,data){
 return {ok:status>=200&&status<300,status,json:async()=>data};
}
test("Manual JD recovery requires both independent approval gates and a writable deployment",async()=>{
 assert.equal(available(flags),true);
 const attempts=[
  {...flags,readOnly:true},
  {...flags,dispatchAllowed:false},
  {...flags,applyAllowed:false},
  {...flags,token:""}
 ];
 for(const attempt of attempts){
  assert.equal(available(attempt),false);
  await assert.rejects(dispatch(attempt),/not approved/);
  let requested=false;
  const state=await status({...attempt,fetcher:async()=>{requested=true;throw Error("must not poll")}});
  assert.equal(state.enabled,false);
  assert.equal(requested,false);
 }
});
test("Only a deliberate click dispatches bounded 25-job workflow; subsequent click rejected",async()=>{
 let paths=[],posted=null;
 const fetcher=async (url,opts)=>{
  paths.push(url);
  if(url.endsWith(STATUS_PATH))return response(200,{workflow_runs:[]});
  if(url.endsWith(DISPATCH_PATH)){
   posted=JSON.parse(opts.body);
   return response(204,null);
  }
  throw Error("Unexpected URL");
 };
 const result=await dispatch({...flags,fetcher});
 assert.equal(result.accepted,true);
 assert.equal(result.active,true);
 assert.equal(result.state,"queued");
 assert.deepEqual(posted,{ref:"main",inputs:{apply:"true",limit:"25",approval:"RECOVER_VERIFIED_JD"}});
 assert.deepEqual(paths.map(p=>p.startsWith("https://api.github.com/repos/abhisheknair607-ux/automate_cv/")), [true,true]);
 assert.equal(paths.length,2);
 await assert.rejects(dispatch({...flags,fetcher}),/already queued or running/);
});
test("Pending run is visible after a status request before GitHub indexes the workflow",async()=>{
 const result=await status({...flags,fetcher:async()=>response(200,{workflow_runs:[]})});
 assert.equal(result.state,"queued");
 assert.equal(result.active,true);
 assert.match(result.url,/github\.com\/abhisheknair607-ux\/automate_cv/);
});
test("Run status is normalized from GitHub, including failures",()=>{
 const base={id:12345,html_url:"https://malicious.invalid",created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
 assert.equal(normalize({...base,status:"queued"}).state,"queued");
 assert.equal(normalize({...base,status:"in_progress"}).state,"running");
 assert.equal(normalize({...base,status:"completed",conclusion:"success"}).state,"completed");
 assert.equal(normalize({...base,status:"completed",conclusion:"failure"}).state,"failed");
 assert.equal(normalize({...base,status:"completed",conclusion:"cancelled"}).state,"cancelled");
 assert.equal(normalize({...base,status:"in_progress"}).active,true);
 assert.equal(normalize({...base,status:"completed",conclusion:"success"}).active,false);
 assert.equal(normalize({...base,status:"completed"}).url,"https://github.com/abhisheknair607-ux/automate_cv/actions/runs/12345");
});
test("Completed run stays visible from GitHub even after the page reloads",async()=>{
 const time=new Date(Date.now()+1000).toISOString();
 const fetcher=async()=>response(200,{workflow_runs:[{
  id:908,status:"completed",conclusion:"success",event:"workflow_dispatch",head_branch:"main",
  path:".github/workflows/jd-recovery.yml@main",created_at:time,updated_at:time
 }]});
 const data=await status({...flags,fetcher});
 assert.equal(data.enabled,true);
 assert.equal(data.state,"completed");
 assert.equal(data.active,false);
 assert.equal(data.runId,908);
 assert.match(data.url,/908$/);
});
test("UI has compact user-triggered control, persisted GitHub polling and no auto-dispatch",()=>{
 const html=fs.readFileSync(path.join(root,"garamaal-release-webapp/Index.html"),"utf8");
 const bridge=fs.readFileSync(path.join(root,"standalone/bridge.js"),"utf8");
 const server=fs.readFileSync(path.join(root,"standalone/server.js"),"utf8");
 const workflow=fs.readFileSync(path.join(root,".github/workflows/jd-recovery.yml"),"utf8");
 assert.match(html,/data-action="jd-recovery-run"/);
 assert.match(html,/data-action="refresh"[^>]*>.*?jdRecoveryButtonHTML\(\)/);
 assert.match(html,/jdRecoveryStatusHTML\(\)/);
 assert.match(html,/requestSpecial\('jd-recovery\/run'/);
 assert.match(html,/requestSpecial\('jd-recovery\/status'/);
 assert.match(html,/if\(a==='jd-recovery-run'\)\{triggerJDRecovery\(\);return\}/);
 assert.match(html,/jdRecovery\.active.*scheduleJDRecoveryPoll|scheduleJDRecoveryPoll.*jdRecovery\.active/s);
 assert.match(bridge,/"jd-recovery\/run","jd-recovery\/status"/);
 assert.match(server,/app\.post\("\/api\/jd-recovery\/run"/);
 assert.match(server,/app\.post\("\/api\/jd-recovery\/status"/);
 assert.doesNotMatch(workflow,/^\s+schedule:/m);
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/PYTHONPATH=src python -m automate_cv\.jd_recovery/);
});
