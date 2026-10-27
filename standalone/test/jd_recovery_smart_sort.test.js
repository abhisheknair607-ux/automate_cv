"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const path=require("node:path");
const {SOURCE}=require("../prototype_queries");

function context(){
 const taaza=[
  {row:2,company:"TPI Search",role:"Transfer Pricing Senior Associate",
   url:"https://example.com/tp",location:"London, UK",jdReady:true,
   transferStatus:"Automatic JD — Freshmaal row 3",
   preferences:{Abhishek:"",Pooja:""},categories:"Common"},
  {row:3,company:"Davy",role:"Wealth Management Associate",
   url:"https://example.com/wealth",location:"Dublin, Ireland",jdReady:false,
   transferStatus:"",preferences:{Abhishek:"",Pooja:""},categories:"Common"},
  {row:4,company:"Acme",role:"Head of Cyber Security",
   url:"https://example.com/cyber",location:"Dublin, Ireland",jdReady:false,
   transferStatus:"",preferences:{Abhishek:"",Pooja:""},categories:"Common"}
 ];
 const fresh=[{row:3,company:"TPI Search",role:"Transfer Pricing Senior Associate",
  url:"https://example.com/tp",person:{
   Abhishek:{preference:"",status:"Not started",cv:false},
   Pooja:{preference:"",status:"Not started",cv:false}
  }}];
 const ctx=vm.createContext({
  authorise_:()=>true,
  person_:name=>{if(!["Abhishek","Pooja"].includes(name))throw Error("candidate");return {status:11}},
  taazaRows_:()=>taaza,freshRows_:()=>fresh,taazaCategoryTabs_:()=>[],
  canonical_:v=>String(v).toLowerCase(),effectivePreference_:(a,b)=>a||b||"",
  dashboardReadCache_:(_key,fn)=>fn(),statusOptions_:()=>["Not started"],
  SETTINGS:{maxFreshRow:4},
  sheet_:()=>({getMaxRows:()=>4,getLastRow:()=>4,
   getRange:(r,c,n,w)=>({getValue:()=>"",
    getValues:()=>Array.from({length:n||1},()=>Array.from({length:w||1},()=>"")),
    getDataValidations:()=>Array.from({length:n||1},()=>[null])})})
 });
 vm.runInContext(SOURCE,ctx);
 const list=(candidate,source="taaza",sort="smart")=>
  vm.runInContext("gmListJobsFaceted("+JSON.stringify({
   source,candidate,filter:"all",sort,tabId:"all",pageSize:25
  })+")",ctx);
 return {list};
}

test("Discovery keeps transferred jobs editable and marked Automatic JD",()=>{
 const x=context().list("Abhishek");
 assert.equal(x.total,3);
 assert.deepEqual(Array.from(x.rows,j=>j.row),[2,3,4]);
 assert.equal(x.rows[0].transferred,true);
 assert.equal(x.rows[0].automaticJD,true);
});

test("Smart Sort is candidate-specific and does not hide unavailable JDs",()=>{
 const f=context();
 assert.equal(f.list("Abhishek").rows[0].role,"Transfer Pricing Senior Associate");
 assert.equal(f.list("Pooja").rows[0].role,"Wealth Management Associate");
 assert.equal(f.list("Pooja").total,3);
 assert.deepEqual(Array.from(f.list("Abhishek","taaza","newest").rows,x=>x.row),[4,3,2]);
});

test("Automatic JD appears on matching Make CV cards without changing CV switches",()=>{
 const f=context();
 const jobs=f.list("Abhishek","fresh","newest").rows;
 assert.equal(jobs.length,1);
 assert.equal(jobs[0].automaticJD,true);
 assert.equal(jobs[0].cv,false);
});

test("Smart Sort is declared the Discovery default in both mobile and base UI",()=>{
 const root=path.resolve(__dirname,"../..");
 const mobile=fs.readFileSync(path.join(root,"standalone/mobile_jobs_filters_stats.js"),"utf8");
 const ui=fs.readFileSync(path.join(root,"webapp/Index.html"),"utf8");
 assert.match(mobile,/sort:"smart"/);
 assert.match(mobile,/if\(destination==="discovery"\)f\.sort="smart"/);
 assert.match(mobile,/Smart Sort · Best matches first/);
 assert.match(ui,/value="smart"/);
 assert.match(ui,/Automatic JD/);
});
