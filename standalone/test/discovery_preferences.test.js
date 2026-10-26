"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const root=path.resolve(__dirname,"../..");
const backend=fs.readFileSync(path.join(root,"webapp/Code.gs"),"utf8");
const html=fs.readFileSync(path.join(root,"webapp/Index.html"),"utf8");

function backendContext(){
  const ctx=vm.createContext({console});
  vm.runInContext(backend,ctx,{filename:"webapp/Code.gs"});
  vm.runInContext("authorise_=()=>{};person_=()=>({});",ctx);
  return ctx;
}

test("Discovery hides all transferred vacancies, including in favorite and rejected views",()=>{
  const c=backendContext();
  const taaza=[
    {row:2,company:"Alpha",role:"Transfer Pricing",url:"https://example.org/alpha",jdReady:true,
      categories:"",preferences:{Abhishek:"Favorite",Pooja:""}},
    {row:3,company:"Beta",role:"Analyst",url:"https://example.org/beta",jdReady:false,
      categories:"",preferences:{Abhishek:"Not Interested",Pooja:""}},
    {row:4,company:"Gamma",role:"Adviser",url:"https://example.org/gamma",jdReady:true,
      categories:"",preferences:{Abhishek:"Favorite",Pooja:"Favorite"}}
  ];
  const fresh=[{row:8,company:"Alpha",role:"Transfer Pricing",url:"https://example.org/alpha",
    person:{Abhishek:{preference:"Favorite"},Pooja:{preference:""}}}];
  c.taazaRows_=()=>taaza;
  c.freshRows_=()=>fresh;
  c.taazaCategoryTabs_=()=>[];
  for(const candidate of ["Abhishek","Pooja"]){
    const all=c.listJobs({source:"taaza",candidate,filter:"all"});
    assert.equal(all.total,candidate==="Abhishek"?1:2);
    assert.ok(all.rows.every(x=>x.company!=="Alpha"));
    assert.equal(c.listJobs({source:"taaza",candidate,filter:"transferred"}).total,0,
      "Legacy transferred filter cannot expose jobs managed in Freshmaal");
    const favorites=c.listJobs({source:"taaza",candidate,filter:"favorites"});
    assert.deepEqual(Array.from(favorites.rows,x=>x.company),["Gamma"]);
    const excluded=c.listJobs({source:"taaza",candidate,filter:"not-interested"});
    assert.ok(excluded.rows.every(x=>x.company!=="Alpha"));
  }
});

test("Bulk preferences are bounded, validated and return independent job results",()=>{
  const c=backendContext();
  c.lockRun_=action=>action();
  const performed=[];
  c.setJobPreference_=payload=>{
    performed.push(payload);
    if(payload.row===4)throw Error("Row changed in Google Sheets");
    return {updatedRows:2};
  };
  const one=(row)=>({row,expected:{company:"Company "+row,role:"Role",url:"https://example.org/"+row}});
  const result=c.bulkSetJobPreferences({source:"taaza",candidate:"Abhishek",value:"Favorite",
    jobs:[one(3),one(4),one(5)]});
  assert.equal(result.completed,2);
  assert.equal(result.failed,1);
  assert.equal(result.results[1].ok,false);
  assert.equal(performed.length,3);
  assert.ok(performed.every(x=>x.candidate==="Abhishek"&&x.value==="Favorite"));
  assert.throws(()=>c.bulkSetJobPreferences({source:"fresh",candidate:"Abhishek",value:"Favorite",jobs:[one(3)]}),/Discovery/);
  assert.throws(()=>c.bulkSetJobPreferences({source:"taaza",candidate:"Abhishek",value:"Deleted",jobs:[one(3)]}),/Not Interested or Favorite/);
  assert.throws(()=>c.bulkSetJobPreferences({source:"taaza",candidate:"Abhishek",value:"Favorite",jobs:[one(3),one(3)]}),/unique valid/);
  assert.throws(()=>c.bulkSetJobPreferences({source:"taaza",candidate:"Pooja",value:"Favorite",
    jobs:Array.from({length:21},(_,i)=>one(i+3))}),/1–20/);
});

test("Individual preferences preserve loaded pages and scroll; only touched card is changed",async()=>{
  const a=html.indexOf("function applyPreferenceLocally(");
  const b=html.indexOf("async function runCvNow(",a);
  assert.ok(a>0&&b>a);
  const rows=Array.from({length:30},(_,i)=>({row:i+3,role:"Job "+i,company:"Co",url:"https://example.org/"+i}));
  const state={section:"discovery",candidate:"Abhishek",filter:"all",page:3,pageSize:10,detail:null,
    bulk:new Map([[4,rows[1]]]),data:{rows,total:60,pages:6,page:3}};
  const main={scrollTop:1360};
  const cardNodes=new Map(rows.map(x=>[x.row,{removed:false,outerHTML:"",
    remove(){this.removed=true;cardNodes.delete(x.row)}}]));
  const ids={jobCount:{textContent:""},selectionBarMount:{innerHTML:""}};
  let requestCount=0,renderCount=0;
  const c=vm.createContext({
    state,preferencePending:new Set(),document:{
      querySelector:q=>{
        const m=q.match(/data-job-row="(\d+)"/);
        if(m)return cardNodes.get(Number(m[1]))||null;
        if(q===".pagination")return {set outerHTML(x){this.value=x}};
        return null;
      },
      getElementById:id=>ids[id]||null
    },card:()=>"<article></article>",pagination:()=>"<div>pagination</div>",
    selectionBar:()=>"<button>Selected</button>",expected:j=>j,
    run:async()=>{requestCount++;return {message:"Updated."}},
    toast:()=>{},drawDetail:()=>{},render:()=>{renderCount++},
    fetchList:()=>{throw Error("Must never fetch the first page")},console
  });
  vm.runInContext(html.slice(a,b),c);
  await c.setPreference(5,"Not Interested",null);
  assert.equal(requestCount,1);
  assert.equal(state.data.total,59);
  assert.equal(state.data.rows.length,29);
  assert.equal(state.data.page,3);
  assert.equal(state.page,3);
  assert.equal(main.scrollTop,1360);
  assert.equal(renderCount,0);
  assert.equal(cardNodes.has(5),false);
  assert.ok(cardNodes.has(31));
  await c.setPreference(4,"Favorite",null);
  assert.equal(state.data.rows.length,29);
  assert.equal(state.data.rows.find(x=>x.row===4).favorite,true);
  assert.equal(state.bulk.get(4).favorite,true);
  assert.equal(renderCount,0);
});

test("Selection controls show only bulk Not Interested and Favourite, never Freshmaal transfer",()=>{
  const start=html.indexOf("function selectionBar()");
  const end=html.indexOf("function listView()",start);
  assert.ok(start>=0&&end>start);
  const ctx=vm.createContext({state:{bulk:new Map([[1,{}],[2,{}]])},icon:name=>"<svg>"+name+"</svg>",
    document:{getElementById:()=>null}});
  vm.runInContext(html.slice(start,end),ctx);
  const output=ctx.selectionBar();
  assert.match(output,/data-action="bulk-preference" data-value="Not Interested"/);
  assert.match(output,/data-action="bulk-preference" data-value="Favorite"/);
  assert.doesNotMatch(output,/bulk-transfer|Seems Fresh|Send to Freshmaal/);
  assert.match(html,/syncSelectionBar\(\);return/);
  assert.match(html,/async function bulkSetPreferences/);
  assert.doesNotMatch(html,/data-action="bulk-transfer"/);
});
