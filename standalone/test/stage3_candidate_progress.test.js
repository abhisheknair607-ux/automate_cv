"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const {SOURCE}=require("../prototype_queries");

function fixture(){
 const cand=(status,cvLink,more={})=>({status,cvLink,cv:false,cl:false,web:false,
   selected:false,score:75,rank:1,workflow:"",preference:"",...more});
 const rows=[
  {row:3,company:"Sample A",role:"Finance Analyst",url:"https://example.com/a",location:"Dublin",
   person:{Abhishek:cand("NA","https://drive.google.com/mock-a"),Pooja:cand("NA","")}},
  {row:4,company:"Sample B",role:"Transfer Pricing Senior",url:"https://example.com/b",location:"London",
   person:{Abhishek:cand("NA",""),Pooja:cand("NA","https://drive.google.com/mock-b")}},
  {row:5,company:"Sample C",role:"Private Wealth Associate",url:"https://example.com/c",location:"Dublin",
   person:{Abhishek:cand("NA","https://drive.google.com/mock-c"),Pooja:cand("NA","")}},
  {row:6,company:"Sample D",role:"Finance Business Partner",url:"https://example.com/d",location:"Cork",
   person:{Abhishek:cand("Applied",""),Pooja:cand("NA","")}}
 ];
 const progress=[
  ["Applied + Connected","Unapplied"],
  ["Unapplied","Applied"],
  ["Applied","Applied + Connected"],
  ["","Unapplied"],
  ["",""]
 ];
 let reads=0;
 const sh={
  getMaxRows:()=>7,
  getRange:(r,c,n,w)=>{
   if(c===57&&r===3&&w===2){reads++;return {getValues:()=>progress.slice(0,n)};}
   return {getDataValidations:()=>Array.from({length:n},()=>[null])};
  }
 };
 const ctx=vm.createContext({
  SETTINGS:{maxFreshRow:7},
  authorise_:()=>true,
  person_:x=>{if(!["Abhishek","Pooja"].includes(x))throw Error("Unknown candidate");return {status:x==="Abhishek"?11:12}},
  sheet_:x=>{assert.equal(x,"fresh");return sh},
  freshRows_:()=>rows,
  taazaRows_:()=>[{row:2,company:"Demo",role:"Analyst",url:"https://example.com/t1",
    preferences:{Abhishek:"",Pooja:""},categories:"",location:"Dublin"}],
  taazaCategoryTabs_:()=>[],
  dashboardReadCache_:(_k,callback)=>callback(),
  effectivePreference_:(x,y)=>x||y||"",
  canonical_:x=>String(x||"").toLowerCase(),
  statusOptions_:()=>["NA","Applied"]
 });
 vm.runInContext(SOURCE,ctx,{timeout:2000});
 return {ctx,get reads(){return reads}};
}
test("dashboard counts use BE/BF application progress, not the unrelated K/L CV status",()=>{
 const x=fixture();
 const a=vm.runInContext('gmPipelineStats("Abhishek")',x.ctx,{timeout:2000});
 const p=vm.runInContext('gmPipelineStats("Pooja")',x.ctx,{timeout:2000});
 assert.deepEqual([a.makeCvJobs,a.applied,a.appliedConnected,a.cvPrepared],[4,3,1,2]);
 assert.deepEqual([p.makeCvJobs,p.applied,p.appliedConnected,p.cvPrepared],[4,2,1,1]);
 assert.ok(x.reads>=2);
});
test("candidate-specific faceted filters preserve Applied and Applied + Connected",()=>{
 const x=fixture();
 for(const [name,status,expected] of [
  ["Abhishek","connected",[3]],["Pooja","connected",[5]],
  ["Abhishek","applied",[6,5,3]],["Pooja","applied",[5,4]],
  ["Pooja","prepared",[4]],["Abhishek","prepared",[5,3]]
 ]){
  const result=vm.runInContext(
    'gmListJobsFaceted('+JSON.stringify({source:"fresh",candidate:name,filter:status,sort:"newest",pageSize:20})+')',
    x.ctx,{timeout:2000});
  assert.deepEqual(Array.from(result.rows,job=>job.row),expected,name+" "+status);
 }
});
test("invalid candidate is rejected; progress projection contains no Sheet writes",()=>{
 const x=fixture();
 assert.throws(()=>vm.runInContext('gmPipelineStats("Someone Else")',x.ctx),/Unknown candidate/);
 assert.doesNotMatch(SOURCE,/\.setValues?\s*\(/);
 assert.doesNotMatch(SOURCE,/\.clearContent\s*\(/);
});
