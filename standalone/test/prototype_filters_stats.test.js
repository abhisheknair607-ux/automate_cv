"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm"),fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"../.."),read=p=>fs.readFileSync(path.join(root,p),"utf8");
function context(){
 const ab={cv:true,cvLink:"https://docs.google.com/cv1",progress:"Applied",selected:true,preference:"",notInterested:false,score:94};
 const po={cv:true,cvLink:"",progress:"Unapplied",selected:false,preference:"",notInterested:false,score:77};
 const taaza=[
  {row:2,company:"Bank Group",role:"Valuations Analyst",location:"London",url:"https://example.org/j-1",jdReady:true,preferences:{Abhishek:"",Pooja:""},categories:"Deals"},
  {row:3,company:"Tax Advisory",role:"Transfer Pricing Senior",location:"Dublin",url:"https://example.org/j-2",jdReady:false,preferences:{Abhishek:"",Pooja:"Favorite"},categories:"Tax"},
  {row:4,company:"WealthCo",role:"Private Wealth Associate",location:"London",url:"https://example.org/j-3",jdReady:true,preferences:{Abhishek:"",Pooja:""},categories:""},
  {row:5,company:"Advisory New",role:"Transfer Pricing Assistant",location:"Dublin",url:"https://example.org/j-4",jdReady:true,preferences:{Abhishek:"",Pooja:"Favorite"},categories:"Tax"}
 ];
 const fresh=[
  {row:3,company:"Bank Group",role:"Valuations Analyst",location:"London",url:"https://example.org/j-1",person:{Abhishek:ab,Pooja:po}},
  {row:4,company:"Tax Advisory",role:"Transfer Pricing Senior",location:"Dublin",url:"https://example.org/j-2",person:{
   Abhishek:{cv:true,cvLink:"https://docs.google.com/cv2",progress:"Unapplied",preference:"",notInterested:false,score:90},
   Pooja:{cv:false,cvLink:"",progress:"Applied + Connected",preference:"",notInterested:false,score:77}
  }},
  {row:5,company:"WealthCo",role:"Private Wealth Associate",location:"London",url:"https://example.org/j-3",person:{
   Abhishek:{cv:true,cvLink:"https://docs.google.com/cv3",progress:"Applied + Connected",preference:"",notInterested:false,score:87},
   Pooja:{cv:false,cvLink:"",progress:"Unapplied",preference:"",notInterested:false,score:65}
  }}
 ];
 const ctx={
  authorise_:()=>{},person_:x=>{if(!["Abhishek","Pooja"].includes(x))throw Error("wrong candidate")},
  taazaRows_:()=>taaza,freshRows_:()=>fresh,canonical_:x=>x,
  effectivePreference_:(a,b)=>a||b||"",
  taazaCategoryTabs_:()=>[{id:"deals",name:"Deals"},{id:"tax",name:"Tax"}],
  APPLICATION_PROGRESS:["Unapplied","Applied","Applied + Connected","Rejected","Accepted"]
 };
 vm.createContext(ctx);vm.runInContext(require("../prototype_queries").SOURCE,ctx);
 return ctx;
}
test("Preview job summaries distinguish prepared CVs, applications and connections for each candidate",()=>{
 const c=context(),a=c.gmPipelineStats("Abhishek"),p=c.gmPipelineStats("Pooja");
 assert.equal(a.discoveryJobs,4);assert.equal(a.makeCvJobs,3);assert.equal(a.cvPrepared,3);
 assert.equal(a.applied,2);assert.equal(a.appliedConnected,1);
 assert.equal(a.waitingToApply,1);assert.equal(a.waitingToConnect,1);
 assert.equal(p.cvPrepared,0);assert.equal(p.applied,1);assert.equal(p.appliedConnected,1);
 assert.equal(p.waitingToApply,0);assert.equal(p.waitingToConnect,0);
});
test("Exact global facet filtering and sorting precedes pagination",()=>{
 const c=context(),data=c.gmListJobsFaceted({candidate:"Abhishek",source:"fresh",sort:"score",pageSize:1,page:1,filter:"all",facets:{location:"London"}});
 assert.equal(data.total,2);assert.equal(data.rows.length,1);
 assert.equal(data.rows[0].company,"Bank Group");assert.equal(data.rows[0].score,94);
 assert.ok(data.facetOptions.company.includes("Tax Advisory")); // all eligible rows, not page-one only
 assert.equal(data.rows[0].department,"Corporate Finance & Deals");
 assert.ok(!data.rows[0].person); // do not leak the other candidate's row
 const next=c.gmListJobsFaceted({candidate:"Abhishek",source:"fresh",sort:"score",pageSize:1,page:2,facets:{location:"London"}});
 assert.equal(next.rows[0].company,"WealthCo");
});
test("Discovery department, category and candidate interest are source-safe",()=>{
 const c=context();
 const result=c.gmListJobsFaceted({candidate:"Pooja",source:"taaza",pageSize:25,tabId:"tax",facets:{department:"Transfer Pricing"},filter:"favorites"});
 assert.equal(result.total,1);assert.equal(result.rows[0].company,"Advisory New");
 assert.equal(result.rows[0].favorite,true);
 assert.ok(!result.rows[0].preferences);
 const other=c.gmListJobsFaceted({candidate:"Abhishek",source:"taaza",pageSize:25,filter:"all"});
 assert.equal(other.total,1); // only the new Taaza URL is not in Freshmaal
});
test("Only preview scripts use the read-only query methods; baseline Jobs UI remains intact",()=>{
 const code=read("standalone/mobile_jobs_filters_stats.js");
 assert.doesNotThrow(()=>new vm.Script(code));
 assert.match(code,/gmListJobsFaceted/);
 assert.match(code,/gmPipelineStats/);
 assert.match(code,/Next move/);
 assert.match(code,/data-action="repair-ranks"/);
 assert.match(code,/Application reminders/);
 assert.match(code,/Enable browser alerts/);
 assert.match(code,/Notification.requestPermission/);
 const server=read("standalone/server.js");
 assert.match(server,/\/prototype\/filters-stats\.js/);
 const runtime=read("standalone/runtime.js");
 assert.match(runtime,/"gmPipelineStats", "gmListJobsFaceted"/);
 assert.match(runtime,/READ_ONLY_METHODS/);
 for(const name of ["updateFreshControl","setJobPreference","runCvApiNow","updateApplicationProgress"])
  assert.ok(!code.includes('baseRun("'+name+'"'));
});
