"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const path=require("node:path");
const {SOURCE}=require("../prototype_queries");
const variants=require("../mobile_location_variants");
const root=path.resolve(__dirname,"../..");
function fixture(){
 const raw=[
  [2,"Alpha","UK", "https://example.com/alpha"],
  [3,"Beta","London, UK","https://example.com/beta"],
  [4,"Gamma","Manchester, United Kingdom","https://example.com/gamma"],
  [5,"Delta","United States","https://example.com/delta"],
  [6,"Epsilon","Dublin, Ireland","https://example.com/epsilon"],
  [7,"Zeta","Ukraine","https://example.com/zeta"]
 ];
 const taaza=raw.map(([row,company,location,url])=>({row,company,role:"Finance Analyst",location,url,
  jdReady:true,preferences:{Abhishek:"",Pooja:""},categories:"",score:75}));
 const fresh=raw.map(([row,company,location,url])=>({row:row+1,company,role:"Finance Analyst",location,url:url+"/fresh",
  person:{Abhishek:{preference:"",status:"NA",cvLink:""},Pooja:{preference:"",status:"NA",cvLink:""}}}));
 const ctx=vm.createContext({
  authorise_:()=>true,person_:c=>{if(!["Abhishek","Pooja"].includes(c))throw Error("Unknown candidate");return {status:11}},
  taazaRows_:()=>taaza,freshRows_:()=>fresh,taazaCategoryTabs_:()=>[],
  sheet_:()=>({getMaxRows:()=>50,getRange:(row,col,n,width)=>({
   getValues:()=>Array.from({length:n},()=>["",""]),
   getDataValidations:()=>Array.from({length:n},()=>[null])
  })}),
  dashboardReadCache_:(_key,fn)=>fn(),
  SETTINGS:{maxFreshRow:40},
  canonical_:u=>String(u).toLowerCase(),
  effectivePreference_:(a,b)=>a||b||"",
  statusOptions_:()=>["NA","Applied"]
 });
 vm.runInContext(SOURCE,ctx,{timeout:2500});
 const list=(source,candidate,locationSelection)=>vm.runInContext(
  "gmListJobsFaceted("+JSON.stringify({source,candidate,filter:"all",sort:"newest",
     locationSelection,facets:{},page:1,pageSize:25})+")",ctx,{timeout:2500});
 return {list};
}
test("UK aliases match as a search group without including unrelated Ukraine or United States",()=>{
 for(const location of ["UK","London, UK","Manchester, United Kingdom","Scotland","Great Britain","Cardiff, Wales","U.K."])
  assert.equal(variants.matches(location,"UK"),true,location);
 for(const location of ["Ukraine","United States","New England, US","New South Wales, Australia"])
  assert.equal(variants.matches(location,"UK"),false,location);
 assert.equal(variants.matches("United States","United"),true);
 assert.equal(variants.matches("United Kingdom","United"),true);
});
test("excluding UK variants keeps other countries in Discovery and Make CV",()=>{
 const f=fixture();
 for(const source of ["taaza","fresh"])for(const candidate of ["Abhishek","Pooja"]){
  const result=f.list(source,candidate,{mode:"except",values:["UK","London, UK","Manchester, United Kingdom"]});
  assert.deepEqual(Array.from(result.rows,x=>x.company),["Zeta","Epsilon","Delta"],source+" "+candidate);
  assert.equal(result.facetOptions.location.length,6,"All source options remain available for restoring exclusions");
 }
});
test("searching United afterwards can accumulate additional exact exclusions; none-selected works",()=>{
 const f=fixture();
 const x=f.list("fresh","Abhishek",{mode:"except",values:["UK","London, UK","Manchester, United Kingdom","United States"]});
 assert.deepEqual(Array.from(x.rows,r=>r.location),["Ukraine","Dublin, Ireland"]);
 const y=f.list("taaza","Pooja",{mode:"only",values:["United States","Dublin, Ireland"]});
 assert.deepEqual(Array.from(y.rows,r=>r.location),["Dublin, Ireland","United States"]);
 assert.equal(f.list("fresh","Pooja",{mode:"only",values:[]}).total,0);
});
test("invalid selections are rejected; filters, location script and CSS contain no write logic",()=>{
 const {SOURCE}=require("../prototype_queries");
 const js=fs.readFileSync(path.join(root,"standalone/mobile_jobs_filters_stats.js"),"utf8");
 const css=fs.readFileSync(path.join(root,"standalone/mobile_collage.css"),"utf8");
 const server=fs.readFileSync(path.join(root,"standalone/server.js"),"utf8");
 assert.match(js,/data-gmf-loc="exclude"/);
 assert.match(js,/data-gmf-loc="only"/);
 assert.match(js,/data-gmf-loc="include"/);
 assert.match(js,/locationSelection:loc.rule\(f.locationSelection\)/);
 assert.match(js,/locationOptions.filter\(v=>loc.matches\(v,locationTerm\)\)/);
 assert.match(css,/#gmv3-location-picker .gmv3-location-list/);
 assert.match(css,/height:100%;max-height:100%/);
 assert.match(js,/window\.visualViewport\?\.addEventListener\("resize",fitLocationViewport\)/);
 assert.match(server,/\/prototype\/location-variants\.js\?v=m26-location-14/);
 assert.match(server,/\/prototype\/filters-stats\.js\?v=m26-location-14/);
 assert.doesNotMatch(SOURCE,/\.setValues?\s*\(|\.clearContent\s*\(/);
 const f=fixture();
 assert.throws(()=>f.list("fresh","Abhishek",{mode:"bad",values:["UK"]}),/Invalid location selection mode/);
});
