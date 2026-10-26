"use strict";
/** Regression tests: Q status projection must not break candidate-scoped jobs. */
const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const {SOURCE}=require("../prototype_queries");

function fixture(){
 const master=[
  {row:2,company:"EY",role:"Tax Analyst",location:"Dublin",url:"https://jobs.example.com/a",
   jdReady:true,categories:"Common",preferences:{Abhishek:"",Pooja:""}},
  {row:3,company:"EY",role:"Tax Analyst",location:"Dublin",url:"https://jobs.example.com/b",
   jdReady:true,categories:"Common",preferences:{Abhishek:"",Pooja:""}},
  {row:4,company:"PwC",role:"Audit Analyst",location:"Dublin",url:"https://jobs.example.com/c",
   jdReady:true,categories:"Common",preferences:{Abhishek:"",Pooja:"Not Interested"}},
  {row:5,company:"EY",role:"Finance Manager",location:"Cork",url:"https://jobs.example.com/d",
   jdReady:true,categories:"Common",preferences:{Abhishek:"",Pooja:""}},
 ];
 const rows=["Possible","Dup","Not Dup",""];
 const ctx=vm.createContext({
  authorise_:()=>true,
  person_:name=>{if(!["Abhishek","Pooja"].includes(name))throw Error("candidate");return {status:11}},
  taazaRows_:()=>master,freshRows_:()=>[],taazaCategoryTabs_:()=>[],
  canonical_:v=>String(v).toLowerCase(),effectivePreference_:(a,b)=>a||b||"",
  statusOptions_:()=>["NA"],
  SETTINGS:{maxFreshRow:25},
  dashboardReadCache_:(_key,fn)=>fn(),
  sheet_:()=>({
   getMaxRows:()=>20,getLastRow:()=>5,
   getRange:(r,c,n,w)=>({
    getValue:()=>r===1&&c===17?"Duplicate Status":"",
    getValues:()=>r===2&&c===17?rows.map(v=>[v]):Array.from({length:n||1},()=>[""]),
   })
  }),
 });
 vm.runInContext(SOURCE,ctx);
 const list=(status="all",sort="newest",candidate="Abhishek")=>{
  return vm.runInContext("gmListJobsFaceted("+JSON.stringify({
   source:"taaza",candidate,filter:status,sort,pageSize:25
  })+")",ctx);
 };
 return {list};
}
test("ordinary Discovery hides confirmed duplicates, retains candidate independence",()=>{
 const f=fixture();
 assert.deepEqual(Array.from(f.list().rows,x=>x.row),[5,4,2]);
 assert.deepEqual(Array.from(f.list("all","newest","Pooja").rows,x=>x.row),[5,2]);
});
test("duplicate presets group candidates, including not-interested rows",()=>{
 const f=fixture();
 assert.deepEqual(Array.from(f.list("duplicates").rows,x=>x.row),[2,3]);
 assert.deepEqual(Array.from(f.list("confirmed-duplicates").rows,x=>x.row),[3]);
 assert.deepEqual(Array.from(f.list("possible-duplicates").rows,x=>x.row),[2]);
 assert.deepEqual(Array.from(f.list("all-including-duplicates").rows,x=>x.row),[5,4,3,2]);
 assert.equal(f.list().rows[0].duplicateSchemaReady,true);
});
test("duplicate grouping sort is applied before pagination",()=>{
 const f=fixture();
 assert.deepEqual(Array.from(f.list("all-including-duplicates","duplicate-group").rows,x=>x.company),
  ["EY","EY","EY","PwC"]);
});
