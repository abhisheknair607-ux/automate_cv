"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const a=require("../alert_workflows");

function mock(status=204,body={}){
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,options});
  return {ok:status>=200&&status<300,status,json:async()=>body};
 };
 return {fetcher,calls};
}
test("GitHub workflow preview blocked before explicit activation",async()=>{
 const m=mock();
 await assert.rejects(
  a.dispatch({kind:"preview",token:"SECRET",dispatchAllowed:false,fetcher:m.fetcher}),/not activated/);
 assert.equal(m.calls.length,0);
});
test("applying unapproved alerts is always rejected without GitHub call",async()=>{
 const m=mock();
 await assert.rejects(
  a.dispatch({kind:"apply",token:"SECRET",dispatchAllowed:true,applyAllowed:false,fetcher:m.fetcher}),
  /approval/);
 assert.equal(m.calls.length,0);
});
test("manual read-only dedupe runs Python workflow on main and never an AI API",async()=>{
 const m=mock();
 const result=await a.dispatch({kind:"dedupe",token:"SECRET",dispatchAllowed:true,fetcher:m.fetcher});
 assert.equal(result.accepted,true);
 assert.equal(m.calls.length,1);
 assert.equal(m.calls[0].options.method,"POST");
 assert.match(m.calls[0].url,/github\.com\/repos\/abhisheknair607-ux\/automate_cv\/actions\/workflows\/taaza-dedupe-check\.yml\/dispatches$/);
 assert.deepEqual(JSON.parse(m.calls[0].options.body),{ref:"main",inputs:{}});
 assert.doesNotMatch(m.calls[0].url,/openai|claude/);
 assert.equal(m.calls[0].options.headers.Authorization,"Bearer SECRET");
});
test("preview dispatch pinned to requested Dublin-local calendar date, always apply=false",async()=>{
 const m=mock();
 await a.dispatch({kind:"preview",date:"2026-10-25",token:"SECRET",
  dispatchAllowed:true,fetcher:m.fetcher});
 assert.deepEqual(JSON.parse(m.calls[0].options.body),
  {ref:"main",inputs:{apply:"false",on_date:"2026-10-25"}});
 assert.equal(a.available({dispatchAllowed:true,applyAllowed:false,token:"SECRET"}).applyEnabled,false);
});
test("invalid date and unknown operation are fail-closed",async()=>{
 const m=mock();
 for(const date of ["2026-02-31","2026-10-2","2026-13-10"]){
  await assert.rejects(a.dispatch({kind:"preview",date,token:"SECRET",
   dispatchAllowed:true,fetcher:m.fetcher}),/valid YYYY/);
 }
 await assert.rejects(a.dispatch({kind:"delete",token:"SECRET",
  dispatchAllowed:true,fetcher:m.fetcher}),/Unknown workflow/);
 assert.equal(m.calls.length,0);
});
test("GitHub accepts dispatch but completion is never asserted",async()=>{
 const m=mock();
 const out=await a.dispatch({kind:"apply",token:"SECRET",
  dispatchAllowed:true,applyAllowed:true,confirmed:true,fetcher:m.fetcher});
 assert.equal(out.accepted,true);
 assert.match(out.message,/not been confirmed/);
 assert.equal(JSON.parse(m.calls[0].options.body).inputs.apply,"true");
 assert.equal(JSON.parse(m.calls[0].options.body).inputs.approval,"IMPORT_VALIDATED_JOBS");
});
test("GitHub authentication failure gives a safe error without exposing token",async()=>{
 const m=mock(403,{message:"bad credential"});
 await assert.rejects(a.dispatch({kind:"dedupe",token:"SECRET",
  dispatchAllowed:true,fetcher:m.fetcher}),e=>{
    assert.equal(e.httpCode,403);
    assert.doesNotMatch(e.message,/SECRET|bad credential/);
    return true;
  });
});
test("last runs status never invents timestamps or statuses",async()=>{
 const calls=[];
 const fetcher=async(url)=>{
  calls.push(url);
  return {ok:true,status:200,json:async()=>({workflow_runs:[
   {id:42,status:"completed",conclusion:"success",
    html_url:"https://github.com/abc/actions/runs/42",created_at:"2026-10-26T08:00:00Z"}
  ]})};
 };
 const res=await a.latest({token:"SECRET",fetcher});
 assert.equal(res.preview.runId,42);
 assert.equal(res.dedupe.conclusion,"success");
 assert.equal(calls.length,2);
});

test("approved import still refuses missing confirmation",async()=>{
 const m=mock();
 await assert.rejects(a.dispatch({kind:"apply",token:"SECRET",dispatchAllowed:true,applyAllowed:true,fetcher:m.fetcher}),/Confirm the import/);
 assert.equal(m.calls.length,0);
});
