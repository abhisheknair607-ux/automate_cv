"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {makeCoordinator,inputRange,FOUR_HOURS}=require("../on_open_import");
function fakeFirestore(){
 let state={};
 const ref={async get(){return{exists:Object.keys(state).length>0,data:()=>({...state})}}};
 return {
  doc:()=>ref,
  runTransaction:async fn=>fn({get:()=>ref.get(),set(_ref,patch){state={...state,...patch}}}),
  snapshot:()=>({...state})
 };
}
test("range uses Dublin-local dates and a seven-day initial scan",()=>{
 const x=inputRange(null,Date.parse("2026-11-06T08:00:00Z"));
 assert.deepEqual(x,{start_date:"2026-10-31",end_date:"2026-11-06",on_date:""});
 const y=inputRange("2026-10-05T08:00:00Z",Date.parse("2026-11-06T08:00:00Z"));
 assert.equal(y.end_date,"2026-11-06");
 assert.ok(y.start_date<"2026-10-10");
});
test("first signed-in opening dispatches once; repeats are locked",async()=>{
 const db=fakeFirestore(),now=Date.parse("2026-11-06T08:00:00Z");
 let dispatches=0;
 const github=async (_token,path)=>{
  if(path.endsWith("/dispatches")){dispatches++;return{}}
  return {workflow_runs:[]};
 };
 const imp=makeCoordinator({db,token:"test-only",enabled:true,clock:()=>now,github});
 assert.equal((await imp.check()).reason,"started");
 assert.equal((await imp.check()).reason,"running");
 assert.equal(dispatches,1);
 assert.equal(db.snapshot().status,"running");
});
test("only a successful completed workflow advances the cooldown",async()=>{
 const db=fakeFirestore(),start=Date.parse("2026-11-06T08:00:00Z");
 let now=start,id=null,dispatches=0,completed=false;
 const github=async (_token,path,opts)=>{
  if(path.endsWith("/dispatches")){id=opts.body.inputs.auto_run_id;dispatches++;return {}}
  return {workflow_runs:completed?[{display_title:"Garamaal auto import ["+id+"]",status:"completed",
   conclusion:"success",updated_at:new Date(start+40000).toISOString()}]:[]};
 };
 const imp=makeCoordinator({db,token:"test-only",enabled:true,clock:()=>now,github});
 await imp.check();
 completed=true;now=start+60000;
 const result=await imp.status();
 assert.equal(result.status,"succeeded");
 assert.equal(result.lastSuccessAt,new Date(start+40000).toISOString());
 now=start+FOUR_HOURS-1;
 assert.equal((await imp.check()).reason,"cooldown");
 assert.equal(dispatches,1);
 now=start+FOUR_HOURS+40001;
 assert.equal((await imp.check()).reason,"started");
 assert.equal(dispatches,2);
});
test("a failed GitHub workflow does not mark success and has retry backoff",async()=>{
 const db=fakeFirestore(),now=Date.parse("2026-11-06T08:00:00Z");let id=null;
 const github=async (_token,path,opts)=>{
  if(path.endsWith("/dispatches")){id=opts.body.inputs.auto_run_id;return{}}
  return {workflow_runs:id?[{display_title:"Garamaal auto import ["+id+"]",
   status:"completed",conclusion:"failure"}]:[]};
 };
 const imp=makeCoordinator({db,token:"test-only",enabled:true,clock:()=>now,github});
 await imp.check();
 assert.equal((await imp.status()).status,"failed");
 assert.equal(db.snapshot().lastSuccessAt,undefined);
 assert.equal((await imp.check()).reason,"retry-backoff");
});
test("disabled import never dispatches",async()=>{
 const imp=makeCoordinator({db:fakeFirestore(),token:"test",enabled:false,
  github:()=>{throw Error("must not call")}});
 assert.equal((await imp.check()).status,"disabled");
});
