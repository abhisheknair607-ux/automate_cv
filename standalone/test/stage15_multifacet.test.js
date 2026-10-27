"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const {SOURCE}=require("../prototype_queries");
const root=path.resolve(__dirname,"../..");
function fixture(){
 const items=[
  [2,"Big Finance","Transfer Pricing Senior","Dublin, Ireland"],
  [3,"Big Finance Group","Corporate Finance Analyst","London, UK"],
  [4,"Independent Co","Transfer Pricing Assistant Manager","Cork"],
  [5,"Other Capital","Private Wealth Adviser","Manchester, United Kingdom"]
 ];
 const taaza=items.map(([row,company,role,location])=>({
  row,company,role,location,url:"https://example.com/"+row,jdReady:true,categories:"",
  preferences:{Abhishek:"",Pooja:row===2?"Not Interested":""}
 }));
 const fresh=items.map(([row,company,role,location])=>({
  row:row+1,company,role,location,url:"https://example.com/fresh/"+row,
  person:{Abhishek:{preference:"",cvLink:"",status:"NA"},
          Pooja:{preference:"",cvLink:"",status:"NA"}}
 }));
 const ctx=vm.createContext({
  authorise_:()=>true,
  person_:candidate=>{
   if(!["Abhishek","Pooja"].includes(candidate))throw Error("Unknown candidate");
   return {status:11}
  },
  taazaRows_:()=>taaza,freshRows_:()=>fresh,taazaCategoryTabs_:()=>[],
  canonical_:v=>String(v).toLowerCase(),effectivePreference_:(a,b)=>a||b||"",
  statusOptions_:()=>["NA","Applied"],
  SETTINGS:{maxFreshRow:40},
  sheet_:()=>({getMaxRows:()=>40,getRange:(row,col,n)=>({
   getValues:()=>Array.from({length:n},()=>["",""]),
   getDataValidations:()=>Array.from({length:n},()=>[null])
  })}),
  dashboardReadCache_:(_key,fn)=>fn()
 });
 vm.runInContext(SOURCE,ctx,{timeout:3000});
 function list(source,candidate,facetSelections={},locationSelection={mode:"all",values:[]}){
  const opts={source,candidate,facetSelections,locationSelection,pageSize:50,sort:"newest"}; // Filter tests assert prior newest ordering; Smart Sort is tested separately.
  return vm.runInContext("gmListJobsFaceted("+JSON.stringify(opts)+")",ctx,{timeout:3000});
 }
 return {list};
}
const rule=(mode,values)=>({mode,values});
test("Company selection supports exact multi-include and excludes lookalike company names",()=>{
 const x=fixture();
 for(const source of ["fresh","taaza"]){
  const one=x.list(source,"Abhishek",{company:rule("only",["Big Finance"])});
  assert.deepEqual(Array.from(one.rows,j=>j.company),["Big Finance"]);
  const excluded=x.list(source,"Abhishek",{company:rule("except",["Big Finance","Big Finance Group"])});
  assert.deepEqual(Array.from(excluded.rows,j=>j.company),["Other Capital","Independent Co"]);
 }
});
test("Designation and derived Department include/exclude stack independently with Location",()=>{
 const x=fixture();
 for(const source of ["fresh","taaza"]){
  const chosen=x.list(source,"Abhishek",{
   company:rule("only",["Big Finance","Independent Co"]),
   designation:rule("except",["Transfer Pricing Assistant Manager"]),
   department:rule("only",["Transfer Pricing"])
  },rule("except",["London, UK"]));
  assert.deepEqual(Array.from(chosen.rows,j=>j.company),["Big Finance"]);
  const all=x.list(source,"Abhishek",{
   department:rule("except",["Transfer Pricing"]),
   designation:rule("only",["Private Wealth Adviser","Corporate Finance Analyst"])
  });
  assert.deepEqual(Array.from(all.rows,j=>j.company),["Other Capital","Big Finance Group"]);
 }
});
test("Blank only-selection means no jobs, and candidate preference isolation persists",()=>{
 const x=fixture();
 assert.equal(x.list("fresh","Abhishek",{company:rule("only",[])}).total,0);
 assert.equal(x.list("taaza","Abhishek",{designation:rule("only",[])}).total,0);
 assert.equal(x.list("taaza","Pooja").total,3);
 assert.equal(x.list("taaza","Abhishek").total,4);
});
test("Bad facet mode, non-array selections and oversized sets are rejected",()=>{
 const x=fixture();
 assert.throws(()=>x.list("taaza","Abhishek",{company:rule("unknown",[])}),/Invalid company selection/);
 assert.throws(()=>x.list("fresh","Pooja",{department:{mode:"only",values:"Transfer Pricing"}}),/Too many department selections/);
 assert.throws(()=>x.list("fresh","Pooja",{designation:rule("only",Array(751).fill("x"))}),/Too many designation selections/);
});
test("All four mobile filters use one checkbox picker, no legacy browser autocomplete",()=>{
 const js=fs.readFileSync(path.join(root,"standalone/mobile_jobs_filters_stats.js"),"utf8");
 const css=fs.readFileSync(path.join(root,"standalone/mobile_collage.css"),"utf8");
 for(const field of ["company","location","designation","department"]){
  assert.match(js,new RegExp('locationField\\("'+field+'"\\)'));
  assert.match(js,new RegExp('f\\[field\\+"Selection"\\]'));
 }
 assert.match(js,/facetSelections:\{/);
 assert.match(js,/openLocationPicker\(e\.target\.closest/);
 assert.match(js,/data-gmf-loc="exclude"/);
 assert.match(js,/data-gmf-loc="only"/);
 assert.match(js,/data-gmf-loc="include"/);
 assert.match(css,/\[data-gmf-loc="open"\]/);
 assert.doesNotMatch(SOURCE,/\.setValues?\s*\(|\.clearContent\s*\(/);
});
