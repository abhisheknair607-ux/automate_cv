"use strict";
/** Regression tests: Q status projection must not break candidate-scoped jobs. */
const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const {SOURCE}=require("../prototype_queries");

function fixture(additions=[]){
 const master=[
  {row:2,company:"EY",role:"Tax Analyst",location:"Dublin",url:"https://jobs.example.com/a",
   jdReady:true,categories:"Common",preferences:{Abhishek:"",Pooja:""}},
  {row:3,company:"EY",role:"Tax Analyst",location:"Dublin",url:"https://jobs.example.com/b",
   jdReady:true,categories:"Common",preferences:{Abhishek:"",Pooja:""}},
  {row:4,company:"PwC",role:"Audit Analyst",location:"Dublin",url:"https://jobs.example.com/c",
   jdReady:true,categories:"Common",preferences:{Abhishek:"",Pooja:"Not Interested"}},
  {row:5,company:"EY",role:"Finance Manager",location:"Cork",url:"https://jobs.example.com/d",
   jdReady:true,categories:"Common",source:"Email Alerts · Needs Review",preferences:{Abhishek:"",Pooja:""}},
 ];
 master.push(...additions);
 const rows=["Possible","Dup","Not Dup","",...additions.map(()=>"")];
 const ctx=vm.createContext({
  authorise_:()=>true,
  person_:name=>{if(!["Abhishek","Pooja"].includes(name))throw Error("candidate");return {status:11}},
  taazaRows_:()=>master,freshRows_:()=>[],taazaCategoryTabs_:()=>[],
  canonical_:v=>String(v).toLowerCase(),effectivePreference_:(a,b)=>a||b||"",
  statusOptions_:()=>["NA"],
  SETTINGS:{maxFreshRow:25},
  dashboardReadCache_:(_key,fn)=>fn(),
  sheet_:()=>({
   getMaxRows:()=>100,getLastRow:()=>master.length+1,
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
 assert.deepEqual(Array.from(f.list("duplicates").rows,x=>x.row),[3]);
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

test("needs-review filter shows unresolved imported jobs without exposing Dup rows",()=>{
 const f=fixture();
 assert.deepEqual(Array.from(f.list("needs-review").rows,j=>j.row),[5]);
 assert.deepEqual(Array.from(f.list("duplicates").rows,j=>j.row),[3]);
});

test("Unresolved LinkedIn cards are hidden by default but visible through their filter",()=>{
 const f=fixture([{
  row:6,company:"Employer to verify",role:"Review LinkedIn vacancy #4486045523",
  location:"",url:"https://www.linkedin.com/jobs/view/4486045523/",
  jdReady:false,source:"Email Alerts · Needs Review",preferences:{Abhishek:"",Pooja:""}
 }]);
 assert.deepEqual(Array.from(f.list("unresolved-linkedin").rows,j=>j.row),[6]);
 assert.deepEqual(Array.from(f.list("needs-review").rows,j=>j.row),[6,5]);
 assert.deepEqual(Array.from(f.list().rows,j=>j.row),[5,4,2]);
 assert.deepEqual(Array.from(f.list("all-including-duplicates").rows,j=>j.row),[5,4,3,2]);
 assert.equal(f.list("unresolved-linkedin").rows[0].unresolvedLinkedIn,true);
});
test("Only one copy of exact and high-confidence similar jobs appears; originals survive",()=>{
 const add=[
  {row:6,company:"EY",role:"Finance Manager",location:"Cork",
   url:"https://jobs.example.com/d",jdReady:false,preferences:{Abhishek:"",Pooja:""}},
  {row:7,company:"Davy",role:"Wealth Adviser",location:"Dublin, Ireland",
   url:"https://www.linkedin.com/jobs/view/4485000010/",jdReady:false,preferences:{Abhishek:"",Pooja:""}},
  {row:8,company:"Davy",role:"Wealth Adviser",location:"Dublin, Ireland",
   url:"https://www.linkedin.com/jobs/view/4485000020/",jdReady:false,preferences:{Abhishek:"",Pooja:""}},
  {row:9,company:"Davy",role:"Wealth Adviser",location:"Dublin, Ireland",
   url:"https://www.linkedin.com/jobs/view/4485000030/",jdReady:false,preferences:{Abhishek:"Not Interested",Pooja:""}}
 ];
 const f=fixture(add);
 const visible=f.list();
 assert.deepEqual(Array.from(visible.rows,j=>j.row),[7,5,4,2]);
 assert.equal(visible.rows.find(x=>x.row===5).duplicateMatches,1);
 assert.equal(visible.rows.find(x=>x.row===7).duplicateMatches,2);
 assert.equal(visible.rows.find(x=>x.row===7).autoDuplicateOf,null);
 assert.deepEqual(Array.from(f.list("all-including-duplicates").rows,j=>j.row),[9,8,7,6,5,4,3,2]);
 const dupe=f.list("duplicates");
 assert.deepEqual(Array.from(dupe.rows,j=>j.row),[7,8,9,2,3,5,6]);
});
test("Manual Not Dup and independent requisitions with full JDs stay separate",()=>{
 const f=fixture([
  {row:6,company:"EY",role:"Tax Analyst",location:"Dublin",
   url:"https://jobs.example.com/another",jdReady:true,preferences:{Abhishek:"",Pooja:""}},
 ]);
 assert.equal(f.list().rows.filter(j=>j.role==="Tax Analyst").length,2);
});
