"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {makeCoordinator,publicState,INTERVAL_MS,runCloudJob}=require("../auto_import");

function fakeFirestore(){
 let data={};
 const ref={
  async get(){return{exists:Object.keys(data).length>0,data:()=>({...data})}}
 };
 return {
  doc(){return ref},
  async runTransaction(run){
   return run({
    async get(){return ref.get()},
    set(_ref,patch){data={...data,...patch}}
   });
  },
  snapshot(){return{...data}},
  set(p){data={...data,...p}}
 };
}
test("first opening dispatches once; simultaneous repeat openings do not",async()=>{
 const db=fakeFirestore();let clock=Date.parse("2026-11-04T08:00:00Z"),runs=0;
 const importer=makeCoordinator({db,clock:()=>clock,runJob:async()=>{runs++;return{operation:"op-1"}}});
 const first=await importer.check();
 assert.equal(first.reason,"started");
 const second=await importer.check();
 assert.equal(second.reason,"running");
 assert.equal(runs,1);
});
test("four-hour window starts on success rather than page opening",async()=>{
 const db=fakeFirestore();let clock=Date.parse("2026-11-04T08:00:00Z"),runs=0;
 const importer=makeCoordinator({db,clock:()=>clock,runJob:async()=>{runs++;return{operation:"op-"+runs}}});
 await importer.check();
 db.set({status:"succeeded",runId:null,leaseUntil:null,
  lastSuccessAt:new Date(clock+10000).toISOString()});
 clock+=INTERVAL_MS-1000;
 assert.equal((await importer.check()).reason,"cooldown");
 clock+=12000;
 assert.equal((await importer.check()).reason,"started");
 assert.equal(runs,2);
});
test("a launch failure releases lock with retry backoff",async()=>{
 const db=fakeFirestore();let clock=Date.parse("2026-11-04T08:00:00Z"),runs=0;
 const importer=makeCoordinator({db,clock:()=>clock,runJob:async()=>{runs++;throw Error("dispatch unavailable")}});
 await assert.rejects(importer.check(),/dispatch unavailable/);
 assert.equal(db.snapshot().status,"failed");
 assert.equal(db.snapshot().runId,null);
 assert.equal((await importer.check()).reason,"retry-backoff");
 assert.equal(runs,1);
});
test("no credentials and no run when disabled",async()=>{
 const db=fakeFirestore();
 const importer=makeCoordinator({db,enabled:false,runJob:()=>{throw Error("must not run")}});
 assert.equal((await importer.check()).status,"disabled");
 assert.deepEqual((await importer.status()).duplicates,[]);
});
test("duplicate review exposes only structured proposals",()=>{
 const state=publicState({status:"succeeded",duplicates:{count:1,
  items:[{row:33,company:"A",title:"B",matchedWith:"Jobs!21",
  recommendation:"Possible",reason:"Similar role",internal:"hidden"}]}});
 assert.equal(state.duplicateCount,1);
 assert.equal(state.duplicates[0].internal,undefined);
});
test("Cloud Run dispatch denies invalid job identity",async()=>{
 await assert.rejects(runCloudJob({project:"valid-project",job:"../bad",runId:"x"}),/not configured/);
});
